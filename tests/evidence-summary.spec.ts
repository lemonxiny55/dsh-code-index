import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildIndex } from '../src/buildIndex.js'
import { buildTaskContext } from '../src/context.js'
import { renderContextPack, type ContextPack } from '../src/context-pack.js'
import { buildChangeContext, renderChangeContext } from '../src/change-context.js'
import { buildImpactXray } from '../src/impact-xray.js'
import { tools } from '../src/tools.js'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true, maxRetries: 3 }))) })
async function fixture(extra: Record<string, string> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cix-evidence-')); roots.push(root)
  for (const [file, code] of Object.entries({
    'src/core.ts': "import { same } from './dep'\nimport defaultFn from './default'\nexport function target() { same(); defaultFn(); target(); missingSdk() }\nexport function idle() { return 0 }\n",
    'src/dep.ts': 'export function same() { return 1 }\n',
    'src/default.ts': 'export default function actualName() { return 2 }\n',
    'src/weak.ts': 'export function weak() { return target() }\n',
    'tests/core.spec.ts': "import { target } from '../src/core'\ntest('candidate only', () => target())\n", ...extra,
  })) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), code)
  }
  await mkdir(path.join(root, '.git'))
  return { root, index: await buildIndex(root) }
}

describe('Context Evidence Summary', () => {
  it('preserves the canonical tool text/pack contract and exports real fixture examples', async () => {
    const { root } = await fixture()
    const tool = tools.find(t => t.name === 'code_context')!
    const args = { repoRoot: root, task: 'Explain idle', budgetChars: 5000 }
    const text = await tool.execute(args, {} as never) as string
    const pack = await tool.execute({ ...args, outputFormat: 'pack' }, {} as never) as unknown as ContextPack
    expect(typeof text).toBe('string')
    expect(text).toBe(renderContextPack(pack))
    expect(pack).toMatchObject({ version: 1, evidence: { scope: 'indexed-static-only', basis: 'context-pack' } })
    expect(text).toContain('not proof of no callers')
    expect(pack.evidence?.gaps).toBeUndefined() // whole-file test window is not missing source
    if (process.env.M2_EXAMPLES_DIR) {
      await mkdir(process.env.M2_EXAMPLES_DIR, { recursive: true })
      await writeFile(path.join(process.env.M2_EXAMPLES_DIR, 'context-example.txt'), text + '\n')
      await writeFile(path.join(process.env.M2_EXAMPLES_DIR, 'pack-example.json'), JSON.stringify(pack, null, 2) + '\n')
      const change = await buildChangeContext(await buildIndex(root), { kind: 'files', files: ['src/core.ts'] })
      await writeFile(path.join(process.env.M2_EXAMPLES_DIR, 'change-example.txt'), renderChangeContext(change) + '\n')
    }
  })

  it('summarizes only selected evidence, without claiming unscanned files or coverage were verified', async () => {
    const { index } = await fixture()
    const { pack } = await buildTaskContext(index, 'Explain target', { budgetChars: 12000 })
    expect(pack.evidence?.scope).toBe('indexed-static-only')
    expect(pack.evidence?.index).toMatchObject({ parsed: 5, partial: 0, failed: 0, unknown: 0 })
    for (const label of ['exact', 'import-scoped', 'name-only'] as const) expect(pack.evidence!.relationships[label]).toBeGreaterThan(0)
    expect(pack.evidence?.tests).toEqual({ candidates: 1, verification: 'not-run' })
    expect(pack.evidence?.unresolved).toMatchObject({ count: 1, sites: [{ file: 'src/core.ts', line: 3, name: 'missingSdk' }] })
    const text = renderContextPack(pack)
    expect(text).toContain('unscanned files not assessed')
    expect(text).toContain('external not established')
    expect(text).toContain('not verified coverage')
    expect(text).not.toContain('all files parsed')
    expect(text).not.toContain('tests passed')
    expect(pack.evidence?.gaps?.some(gap => gap.kind === 'index-incomplete')).toBe(false)
  })

  it('qualifies zero callers and distinguishes no tests found from tests cut for budget', async () => {
    const { index } = await fixture()
    const { pack } = await buildTaskContext(index, 'Explain idle')
    expect(pack.evidence?.callers?.zero).toContainEqual({ name: 'idle', file: 'src/core.ts', line: 4 })
    expect(renderContextPack(pack)).toContain('not proof of no callers')
    const tested = await buildTaskContext(index, 'Explain target', { budgetChars: 500 })
    expect(tested.pack.evidence?.gaps?.some(g => g.code === 'no-test-candidates') ?? false).toBe(false)
    expect(tested.pack.gaps.join(' ')).not.toContain('no related indexed test found')
    expect(tested.pack.budget.packChars).toBeLessThanOrEqual(500)
  })

  it('keeps parse gaps traceable and never assumes a legacy file is parsed', async () => {
    const { index } = await fixture({ 'Bad.ets': '@Component\nstruct Bad { build() {', 'Partial.ts': 'export function broken() { return ;' })
    expect(index.files.find(f => f.path === 'Bad.ets')?.diagnostic?.status).toBe('failed')
    delete index.files.find(f => f.path === 'src/dep.ts')!.diagnostic
    const { pack } = await buildTaskContext(index, 'Explain target', { budgetChars: 12000 })
    expect(pack.evidence?.index).toMatchObject({ partial: 1, failed: 1, unknown: 1 })
    expect(pack.evidence?.index.diagnostics).toContainEqual(expect.objectContaining({ file: 'Bad.ets', status: 'failed', line: expect.any(Number) }))
    expect(pack.evidence?.gaps).toContainEqual(expect.objectContaining({ kind: 'index-incomplete', source: 'indexed-file.diagnostic' }))
    expect(pack.evidence?.gaps).toContainEqual(expect.objectContaining({ kind: 'unavailable', code: 'parse-status-unknown' }))
  })

  it('applies the same static boundary to ArkTS and Rust without adding UI or foreign-call edges', async () => {
    const { index } = await fixture({
      'Card.ets': '@Component\nstruct Card { build() { Text("hello") } }\n',
      'src/lib.rs': 'pub fn rust_evidence() { missing_runtime(); }\n',
    })
    for (const task of ['Explain Card in Card.ets', 'Explain rust_evidence']) {
      const { pack } = await buildTaskContext(index, task)
      expect(pack.evidence?.index).toMatchObject({ parsed: 7, partial: 0, failed: 0 })
      expect(pack.evidence?.scope).toBe('indexed-static-only')
      expect(pack.evidence?.tests.verification).toBe('not-run')
      expect(renderContextPack(pack)).not.toContain('(external)')
    }
    const rust = (await buildTaskContext(index, 'Explain rust_evidence')).pack
    expect(rust.evidence?.unresolved?.sites).toContainEqual({ name: 'missing_runtime', file: 'src/lib.rs', line: 1 })
  })

  it('does not label a source-reader rejection as a proven edit or budget loss', async () => {
    const { root, index } = await fixture()
    await writeFile(path.join(root, 'src/core.ts'), 'export function replacement() { return 42 }\n')
    const { pack } = await buildTaskContext(index, 'Explain target', { budgetChars: 12000 })
    expect(pack.evidence?.gaps).toContainEqual(expect.objectContaining({ kind: 'unavailable', code: 'source-reader-rejected', file: 'src/core.ts', side: 'current' }))
    expect(JSON.stringify(pack)).not.toContain('return 42')
    expect(pack.gaps.join(' ')).not.toContain('changed after indexing')
  })

  it('separates task shortening, selection limits and actual budget rejection', async () => {
    const { index } = await fixture()
    const { pack } = await buildTaskContext(index, `Explain idle ${'请解释。'.repeat(80)}`, { budgetChars: 20000 })
    expect(pack.evidence?.gaps).toContainEqual(expect.objectContaining({ kind: 'selection-limit', code: 'task-summary-shortened' }))
    expect(pack.evidence?.gaps?.some(g => g.kind === 'budget')).toBe(false)
    expect(pack.gaps).not.toContain('budget omitted some evidence')
    const small = await buildTaskContext(index, 'Explain target', { budgetChars: 1500 })
    expect(JSON.stringify(small.pack) + renderContextPack(small.pack)).toContain('budget')
  })

  it.each([300, 500, 5000])('keeps text, JSON and accounting under %i', async budgetChars => {
    const { index } = await fixture({ 'Bad.ets': '@Component\nstruct Bad { build() {' })
    const a = (await buildTaskContext(index, 'Explain target', { budgetChars })).pack
    const b = (await buildTaskContext(index, 'Explain target', { budgetChars })).pack
    expect(a).toEqual(b)
    expect(JSON.stringify(a).length).toBeLessThanOrEqual(budgetChars)
    expect(renderContextPack(a).length).toBeLessThanOrEqual(budgetChars)
    expect(a.budget.usedChars).toBe(renderContextPack(a).length)
    expect(a.budget.packChars).toBe(JSON.stringify(a).length)
    expect(a.gaps.join(' ')).toContain('index incomplete')
  })

  it('shares the index boundary with change context and X-Ray without upgrading paths', async () => {
    const { index } = await fixture()
    const result = await buildChangeContext(index, { kind: 'files', files: ['src/core.ts'] })
    expect(result.evidence?.scope).toBe('indexed-static-only')
    expect(result.evidence?.relationships['name-only']).toBeGreaterThan(0)
    expect(result.evidence?.tests.verification).toBe('not-run')
    expect(renderChangeContext(result)).toContain('Evidence (indexed static scope')
    const view = await buildImpactXray(index, result)
    expect(view.evidence).toEqual(result.evidence)
    expect(view.gaps.join(' ')).toContain('not verified coverage')
    for (const cap of [600, 700, 5000]) expect(renderChangeContext(result, cap).length).toBeLessThanOrEqual(cap)
  })

  it('reports missing selections and baseline content as missing evidence', async () => {
    const { index } = await fixture()
    const result = await buildChangeContext(index, { kind: 'files', files: ['missing.ts'] })
    expect(result.evidence?.gaps).toContainEqual(expect.objectContaining({ kind: 'not-found', code: 'no-changed-symbols' }))
    expect(result.evidence?.callers).toBeUndefined()
    const diff = await buildChangeContext(index, { kind: 'diff', root: index.root,
      text: 'diff --git a/src/core.ts b/src/core.ts\n--- a/src/core.ts\n+++ b/src/core.ts\n@@ -3 +3 @@\n-old\n+new\n' })
    expect(diff.evidence?.gaps).toContainEqual(expect.objectContaining({ kind: 'unavailable', source: 'baseline-content' }))
  })

  it('keeps unavailable Git analysis distinct from an empty successful diff', async () => {
    const { index } = await fixture() // .git marker without a valid Git repository
    const { pack } = await buildTaskContext(index, 'Review current changes target')
    expect(pack.gaps.join(' ')).toContain('change context unavailable')
    expect(pack.evidence?.gaps).toContainEqual({ kind: 'unavailable', code: 'change-context-unavailable', source: 'change-analysis' })
    expect(pack.items.some(item => item.change)).toBe(false)
    expect(pack.gaps.join(' ')).not.toContain('no changes found in the diff')
  })

  it('does not turn unresolved code_refs callees into external calls', async () => {
    const { root } = await fixture()
    const refs = await tools.find(t => t.name === 'code_refs')!.execute({ repoRoot: root, symbol: 'target' }, {} as never) as string
    expect(refs).not.toContain('(external)')
    expect(refs).toContain('unresolved in current index')
    const idle = await tools.find(t => t.name === 'code_refs')!.execute({ repoRoot: root, symbol: 'idle' }, {} as never) as string
    expect(idle).toContain('not proof of no callers')
    // Candidate test file is a source fixture; no code in it was executed.
    expect(await readFile(path.join(root, 'tests/core.spec.ts'), 'utf8')).toContain('candidate only')
  })
})
