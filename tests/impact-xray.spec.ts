import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { buildIndex } from '../src/buildIndex.js'
import { buildChangeContext, renderChangeContext } from '../src/change-context.js'
import { buildImpactXray, XRAY_LIMITS } from '../src/impact-xray.js'
import { asImpactXray, sourcePath } from '../src/client/impact-xray.js'
import { XRAY_EN, XRAY_ZH, xrayTranslator } from '../src/client/xray-locales.js'
import { tools } from '../src/tools.js'

const dirs: string[] = []
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }) })
async function fixture() {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'xray-'))
  dirs.push(parent)
  const root = path.join(parent, '真实 fixture & evidence')
  execFileSync(process.execPath, ['scripts/impact-xray-poc.mjs', root], { cwd: process.cwd(), stdio: 'pipe' })
  return root
}

describe('Impact X-Ray', () => {
  it('uses real Git edits and only existing hops, preserving all three provenance levels and source lines', async () => {
    const root = await fixture()
    const index = await buildIndex(root)
    const result = await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' })
    const view = await buildImpactXray(index, result)
    expect(result.changed.map(row => row.symbol.name)).toEqual(['normalize'])
    expect(view.nodes.find(n => n.changed)?.evidence.code).toContain('input.trim().toUpperCase()')
    expect(new Set(view.edges.map(e => e.resolution))).toEqual(new Set(['exact', 'import-scoped', 'name-only']))
    const hops = [...result.directCallers, ...result.impact].map(row => row.via).concat(result.paths.flatMap(p => p.hops))
    for (const edge of view.edges.filter(e => e.kind === 'call')) {
      expect(hops.some(hop => edge.from === `current:${hop.fromId}` && edge.to === `current:${hop.toId}` &&
        edge.resolution === hop.resolution && edge.reason === hop.reason && edge.evidence.file === hop.callSite.file && edge.evidence.line === hop.callSite.line)).toBe(true)
      const evidence = edge.evidence
      const source = (await readFile(path.join(root, evidence.file), 'utf8')).split(/\r?\n/)
      expect(evidence.code).toEqual(source.slice(evidence.startLine - 1, evidence.line + 3).join('\n'))
    }
    expect(view.tests.some(test => test.file === 'tests/core.test.ts')).toBe(true)
    expect(view.nodes.length).toBeGreaterThan(6) // Desktop expansion fixture
    expect(asImpactXray(JSON.parse(JSON.stringify(view)))).toEqual(view)
    expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThan(XRAY_LIMITS.metadataBytes)
  })

  it('preserves the default canonical string and transports the snapshot through real ToolRuntime metadata', async () => {
    const root = await fixture()
    const ctx = new Context()
    ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} })
    const runtime = new ToolRuntime(ctx)
    const tool = tools.find(t => t.name === 'code_change_context')!
    const dispose = runtime.register(tool)
    try {
      const call = (args: object) => runtime.execute({ callId: 'xray-poc' as Parameters<typeof runtime.execute>[0]['callId'], name: tool.name, arguments: { repoRoot: root, ...args }, signal: new AbortController().signal })
      const legacy = await call({})
      expect(legacy.isError).toBe(false)
      expect(typeof legacy.value).toBe('string')
      expect(legacy.value).toBe(renderChangeContext(await buildChangeContext(await buildIndex(root), { kind: 'git', root, baseRef: 'HEAD' })))
      const xray = await call({ outputFormat: 'xray' })
      expect(xray.isError).toBe(false)
      expect(xray.content).toEqual(legacy.content)
      expect(asImpactXray(xray.meta)?.edges.length).toBeGreaterThan(0)
      const error = await call({ outputFormat: 'xray', files: ['../escape.ts'] })
      expect(error.meta).toBeNull()
      expect(String(error.value)).toContain('path must stay inside')
    } finally { dispose() }
  })

  it('degrades for stale/missing evidence, empty results and bounded large selections', async () => {
    const root = await fixture()
    const index = await buildIndex(root)
    const result = await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' })
    await writeFile(path.join(root, 'src/core.ts'), '// changed after indexing\n')
    const stale = await buildImpactXray(index, result)
    expect(stale.nodes.find(n => n.changed)?.evidence).toMatchObject({ gap: 'source-unavailable' })
    expect(stale.nodes.find(n => n.changed)?.evidence.code).toBeUndefined()
    const empty = { ...result, changed: [], directCallers: [], impact: [], paths: [], tests: [], importDependents: [] }
    expect((await buildImpactXray(index, empty)).nodes).toEqual([])
    const huge = { ...empty, changed: Array.from({ length: 4000 }, (_, i) => ({ ...result.changed[0]!, symbol: { ...result.changed[0]!.symbol, id: `id${i}` } })) }
    const bounded = await buildImpactXray(index, huge)
    expect(bounded.nodes.length).toBeLessThanOrEqual(XRAY_LIMITS.nodes)
    expect(bounded.nodes.length).toBeGreaterThan(0)
    expect(bounded.truncated).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThan(XRAY_LIMITS.metadataBytes)
    expect(asImpactXray({ ...bounded, nodes: [...bounded.nodes, bounded.nodes[0]] })).toBeNull()
    expect(asImpactXray({ ...bounded, edges: [{ from: 'missing' }] })).toBeNull()
  })

  it('attaches real import/test evidence and whole-path confidence without inventing test call edges', async () => {
    const root = await fixture(), index = await buildIndex(root)
    const result = await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' })
    const view = await buildImpactXray(index, result)
    expect(view.version).toBe(2)
    for (const edge of view.edges.filter(e => e.kind === 'import')) {
      const from = view.nodes.find(n => n.id === edge.from)!, to = view.nodes.find(n => n.id === edge.to)!
      expect(result.importDependents.some(i => i.file === from.file && i.changedFile === to.file)).toBe(true)
      expect(edge.evidence.type).toBe('import-site')
      expect(edge.evidence.code).toContain('import ')
      expect(edge.resolution).toBe('import-scoped')
    }
    const test = view.tests[0]!, node = view.nodes.find(n => n.id === test.nodeId)!
    expect(node.evidence.code).toContain('import { normalize }')
    expect(node.evidence.line).toBe(1)
    expect(node.category).toBe('test')
    for (let i = 0; i < view.paths!.length; i++) expect(view.paths![i].resolution).toBe(result.paths[i]!.resolution)
    const heuristic = await buildImpactXray(index, { ...result, tests: [{ file: 'tests/core.test.ts', resolution: 'name-only', reason: 'path-convention' }] })
    const lead = heuristic.nodes.find(n => n.id === heuristic.tests[0]!.nodeId)!
    expect(lead.evidence.type).toBe('test-lead')
    expect(lead.reason).toBe('path-convention')
    expect(heuristic.edges.filter(e => e.kind === 'call').every(e => !e.from.startsWith('file:') && !e.to.startsWith('file:'))).toBe(true)
  })

  it('preserves old PoC replay and rejects malformed path, range, endpoint and limit metadata', async () => {
    const old = JSON.parse(await readFile('assets/impact-xray-poc-evidence.json', 'utf8')).graph.snapshot
    expect(asImpactXray(old)).not.toBeNull()
    const root = await fixture(), index = await buildIndex(root)
    const view = await buildImpactXray(index, await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' }))
    expect(asImpactXray(view)).toEqual(view)
    expect(asImpactXray({ ...view, version: '2' })).toBeNull()
    expect(asImpactXray({ ...view, nodes: [{ ...view.nodes[0], change: {} }] })).toBeNull()
    expect(asImpactXray({ ...view, nodes: [{ ...view.nodes[0], category: ['change'] }] })).toBeNull()
    expect(asImpactXray({ ...view, paths: [{ id: 'bad', from: 'a', to: 'b', resolution: 'exact', omitted: false, edgeIds: ['fabricated'] }] })).toBeNull()
    expect(asImpactXray({ ...view, unmapped: [{ file: 'a', side: 'current', reason: 'outside-symbol', evidence: view.nodes[0]!.evidence, ranges: [{ startLine: 10, endLine: 1 }] }] })).toBeNull()
    expect(asImpactXray({ ...view, bounds: { projection: false, analysis: {}, totals: {} } })).toBeNull()
    expect(asImpactXray({ ...view, edges: Array.from({ length: 49 }, () => view.edges[0]) })).toBeNull()
  })

  it('keeps deleted source on the base side and does not fabricate historical callers', async () => {
    const root = await fixture()
    await rm(path.join(root, 'src/core.ts'))
    const index = await buildIndex(root)
    const result = await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' })
    const view = await buildImpactXray(index, result)
    const removed = view.nodes.find(n => n.name === 'normalize')!
    expect(removed.change).toBe('deleted')
    expect(removed.evidence).toMatchObject({ side: 'base' })
    expect(removed.evidence.code).toContain('input.trim()')
    expect(removed.evidence.code).not.toContain('toUpperCase')
    expect(view.edges.filter(e => e.kind === 'call').some(e => e.to === removed.id)).toBe(false)
    expect(asImpactXray(view)).not.toBeNull()
  })

  it('preserves actual recursive/cyclic hops and their direction under clipping', async () => {
    const root = await fixture()
    await writeFile(path.join(root, 'src/cycle.ts'), 'export function a(n: number): number { return n ? b(n - 1) : a(0) }\nexport function b(n: number): number { return a(n) }\nexport function main() { return b(2) }\n')
    const index = await buildIndex(root)
    const target = index.files.find(f => f.path === 'src/cycle.ts')!.symbols.find(s => s.name === 'a')!
    const result = await buildChangeContext(index, { kind: 'symbols', symbolIds: [target.id] })
    const view = await buildImpactXray(index, result)
    const hops = [...result.directCallers, ...result.impact].map(r => r.via).concat(result.paths.flatMap(p => p.hops))
    const callEdges = view.edges.filter(e => e.kind === 'call')
    expect(callEdges.length).toBeGreaterThan(0)
    expect(view.nodes.some(n => n.name === 'b')).toBe(true)
    expect(view.nodes.some(n => n.name === 'main')).toBe(true)
    for (const e of view.edges.filter(e => e.kind === 'call')) expect(hops.some(h => e.from === `current:${h.fromId}` && e.to === `current:${h.toId}` && e.evidence.line === h.callSite.line)).toBe(true)
    // The projection must never add recursion that the underlying change-context did not return.
    expect(view.edges.filter(e => e.kind === 'call').length).toBeLessThanOrEqual(hops.length)
    expect(asImpactXray(view)).not.toBeNull()
  })

  it('separates analysis clipping, projection clipping and unmapped ranges', async () => {
    const root = await fixture(), index = await buildIndex(root)
    const result = await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' }, { maxImpact: 1 })
    const view = await buildImpactXray(index, { ...result, unmapped: [{ file: 'src/core.ts', side: 'current', reason: 'outside-symbol', ranges: [{ startLine: 2, endLine: 2 }] }] })
    expect(view.bounds!.analysis.callers).toBe(true)
    expect(view.unmapped![0]!.evidence.code).toContain('toUpperCase')
    expect(view.unmapped![0]!.ranges).toEqual([{ startLine: 2, endLine: 2 }])
    expect(view.truncated).toBe(true)
  })

  it('ships complete bilingual product copy with matching placeholders and no translated provenance identifiers', () => {
    expect(Object.keys(XRAY_ZH).sort()).toEqual(Object.keys(XRAY_EN).sort())
    for (const [key, value] of Object.entries(XRAY_EN)) {
      expect(XRAY_ZH[key as keyof typeof XRAY_ZH].trim()).not.toBe('')
      expect([...value.matchAll(/\{\w+\}/g)].map(m => m[0])).toEqual([...XRAY_ZH[key as keyof typeof XRAY_ZH].matchAll(/\{\w+\}/g)].map(m => m[0]))
    }
    expect(xrayTranslator('zh-CN')('rows', { shown: 2, total: 5 })).toContain('2 / 5')
    expect(xrayTranslator('en')('name-only')).toContain('name-only')
    expect(xrayTranslator('zh')('<script>untrusted</script>')).toBe('<script>untrusted</script>')
    expect(xrayTranslator('en')('__proto__')).toBe('__proto__')
    expect(xrayTranslator('zh')('constructor')).toBe('constructor')
  })

  it('treats Windows/special paths and untrusted text as data; refuses traversal and URL schemes', () => {
    expect(sourcePath('D:\\项目 & code', 'src\\特殊文件.ts')).toBe('D:/项目 & code/src/特殊文件.ts')
    for (const file of ['../secret', 'src/../../secret', 'C:\\secret', '/secret', 'javascript:alert(1)', '\u0000evil']) {
      expect(sourcePath('D:/repo', file)).toBeNull()
    }
    expect(sourcePath('https://example.org', 'source.ts')).toBeNull()
    expect(asImpactXray(null)).toBeNull()
    expect(asImpactXray({ card: 'impact-xray', version: 2 })).toBeNull()
  })
})
