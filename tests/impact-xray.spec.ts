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

describe('Impact X-Ray PoC', () => {
  it('uses real Git edits and only existing hops, preserving all three provenance levels and source lines', async () => {
    const root = await fixture()
    const index = await buildIndex(root)
    const result = await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' })
    const view = await buildImpactXray(index, result)
    expect(result.changed.map(row => row.symbol.name)).toEqual(['normalize'])
    expect(view.nodes.find(n => n.changed)?.evidence.code).toContain('input.trim().toUpperCase()')
    expect(new Set(view.edges.map(e => e.resolution))).toEqual(new Set(['exact', 'import-scoped', 'name-only']))
    const hops = [...result.directCallers, ...result.impact].map(row => row.via).concat(result.paths.flatMap(p => p.hops))
    for (const edge of view.edges) {
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
    expect(stale.nodes.find(n => n.changed)?.evidence).toMatchObject({ gap: expect.stringContaining('stale') })
    expect(stale.nodes.find(n => n.changed)?.evidence.code).toBeUndefined()
    const empty = { ...result, changed: [], directCallers: [], impact: [], paths: [], tests: [], importDependents: [] }
    expect((await buildImpactXray(index, empty)).nodes).toEqual([])
    const huge = { ...empty, changed: Array.from({ length: 4000 }, (_, i) => ({ ...result.changed[0]!, symbol: { ...result.changed[0]!.symbol, id: `id${i}` } })) }
    const bounded = await buildImpactXray(index, huge)
    expect(bounded.nodes).toHaveLength(XRAY_LIMITS.nodes)
    expect(bounded.truncated).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThan(XRAY_LIMITS.metadataBytes)
    expect(asImpactXray({ ...bounded, nodes: [...bounded.nodes, bounded.nodes[0]] })).toBeNull()
    expect(asImpactXray({ ...bounded, edges: [{ from: 'missing' }] })).toBeNull()
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
