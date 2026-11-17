import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import * as childProcess from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { buildIndex } from '../src/buildIndex.js'
import { buildChangeContext, renderChangeContext } from '../src/change-context.js'
import { buildReviewBrief, REVIEW_LIMITS, type ReviewOutput } from '../src/review-brief.js'
import { buildTaskContext } from '../src/context.js'
import { tools, invalidateIndexCache } from '../src/tools.js'

// Observe argv-based Git calls without replacing real filesystem/Git behavior.
vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return { ...original, execFile: vi.fn(original.execFile) }
})

const dirs: string[] = []
afterEach(async () => { vi.restoreAllMocks(); invalidateIndexCache(); for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) })
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: 'pipe' })
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'review-contract-')); dirs.push(root)
  await mkdir(path.join(root, 'tests'))
  await writeFile(path.join(root, 'core.ts'), 'export function normalize(x: number) { return x + 1 }\n')
  await writeFile(path.join(root, 'caller.ts'), "import { normalize } from './core'\nexport function caller() { return normalize(1) }\n")
  await writeFile(path.join(root, 'tests/core.test.ts'), "import { normalize } from '../core'\nexport function candidate() { return normalize(2) }\n")
  git(root, 'init', '-q'); git(root, 'add', '.'); git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'base')
  await writeFile(path.join(root, 'core.ts'), 'export function normalize(x: number) { return x + 2 }\n')
  const index = await buildIndex(root)
  return { root, index, change: await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' }) }
}
function bounded(out: ReviewOutput) {
  expect(out.brief.status).toBe('bounded')
  if (out.brief.status !== 'bounded') throw Error('Expected selected evidence')
  expect(out.brief.budget.usedChars).toBe(JSON.stringify(out).length)
  expect(out.brief.budget.usedChars).toBeLessThanOrEqual(out.brief.budget.limit)
  return out.brief
}

it('registers review, renders canonical text, and preserves default text/xray exactly', async () => {
  const { root } = await fixture()
  const tool = tools.find(t => t.name === 'code_change_context')!
  const exec = { agent: { session: { header: { cwd: root } } } } as never
  const before = await tool.execute({}, exec)
  const beforeXray = await tool.execute({ outputFormat: 'xray' }, exec)
  const review = await tool.execute({ outputFormat: 'review' }, exec) as unknown as ReviewOutput
  expect(bounded(review).changes.some(row => row.code?.includes('return x + 2'))).toBe(true)
  expect(bounded(review).relations.some(row => row.kind === 'call' && row.name === 'caller')).toBe(true)
  expect(await tool.execute({ budgetChars: 300 }, exec)).toEqual(before)
  expect(await tool.execute({ outputFormat: 'xray', budgetChars: 300 }, exec)).toEqual(beforeXray)
  expect(bounded(review).verification).toBe('not-run')
})

it('exposes exact symbol IDs in the model-facing code_symbols output', async () => {
  const { root } = await fixture()
  const ctx = new Context(); ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} })
  const runtime = new ToolRuntime(ctx), tool = tools.find(t => t.name === 'code_symbols')!
  const dispose = runtime.register(tool)
  try {
    const result = await runtime.execute({ callId: 'symbol:id' as never, name: 'code_symbols',
      arguments: { repoRoot: root, query: 'normalize' }, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    if (result.isError) throw Error('Runtime failed')
    const hit = (result.value as unknown as Array<{ id: string }>)[0]
    expect(hit.id).toMatch(/^sym:v1:/)
    expect(JSON.stringify(result.content)).toContain(hit.id)
  } finally { dispose(); await ctx.fiber.dispose() }
})

it('runs review through the real declared SDK output and validation pipeline', async () => {
  const { root } = await fixture()
  const ctx = new Context(); ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} })
  const runtime = new ToolRuntime(ctx), tool = tools.find(t => t.name === 'code_change_context')!
  const dispose = runtime.register(tool)
  try {
    const result = await runtime.execute({ callId: 'review:1' as never, name: 'code_change_context',
      arguments: { repoRoot: root, outputFormat: 'review', budgetChars: 5000 }, signal: new AbortController().signal })
    expect(result.isError).toBe(false)
    if (result.isError) throw Error('Runtime failed')
    const output = result.value as unknown as ReviewOutput
    bounded(output)
    expect(result.content).toEqual([{ type: 'text', text: output.text }])
    expect(result.meta).not.toMatchObject({ card: 'impact-xray' })
    const invalid = await runtime.execute({ callId: 'review:invalid' as never, name: 'code_change_context',
      arguments: { repoRoot: root, outputFormat: 'review', budgetChars: 'large' }, signal: new AbortController().signal })
    expect(invalid.isError).toBe(true)
  } finally { dispose(); await ctx.fiber.dispose() }
})

it('reports real HEAD/base, dirty and index time without treating them as a snapshot token', async () => {
  const { root, index, change } = await fixture()
  const brief = bounded(await buildReviewBrief(index, change))
  expect(brief.repository).toMatchObject({ root, head: git(root, 'rev-parse', 'HEAD').trim(), baseRef: change.baseRef,
    dirty: true, indexedAt: index.generatedAt, snapshot: 'non-atomic' })
  expect(brief.repository.observedAt).toBeGreaterThanOrEqual(index.generatedAt)
  const shown = await buildReviewBrief(index, change)
  expect(shown.text).toContain(`Index built: ${new Date(index.generatedAt).toISOString()}`)
  expect(shown.text).toContain('metadata observed:')
  git(root, 'checkout', '--', 'core.ts')
  await mkdir(path.join(root, '.dsh-code-index')); await writeFile(path.join(root, '.dsh-code-index/cache.json'), '{}')
  const clean = bounded(await buildReviewBrief(index, change))
  expect(clean.repository.dirty).toBe(false)
})

it('expresses zero static relationships as a bounded observation, not proof of no callers', async () => {
  const { root } = await fixture()
  await writeFile(path.join(root, 'isolated.ts'), 'export function isolatedMarker() { return 11 }\n')
  const index = await buildIndex(root), change = await buildChangeContext(index, { kind: 'files', files: ['isolated.ts'] })
  const out = await buildReviewBrief(index, change)
  expect(bounded(out).summary.relations).toBe(0)
  expect(out.text).toContain('not proof of no callers or runtime impact')
  expect(out.brief.verification).toBe('not-run')
})

it('preserves all critical gaps even when long warnings and evidence are omitted', async () => {
  const { index, change } = await fixture()
  index.files[0].diagnostic = { status: 'failed', errorCount: 1, missingCount: 0, issues: [] }
  change.unmapped.push({ file: 'extra.txt', side: 'base', ranges: [{ startLine: 1, endLine: 1 }], reason: 'base-content-unavailable' })
  change.truncated.impact = true
  change.warnings.push('long-warning: ' + 'x'.repeat(30000))
  const brief = bounded(await buildReviewBrief(index, change))
  expect(brief.gaps).toEqual(expect.arrayContaining(['parse-diagnostics', 'unmapped-changes', 'upstream-analysis-truncated', 'evidence-omitted']))
  expect(brief.omitted.warnings).toBeGreaterThanOrEqual(1)
})

it('reserves a relation and a candidate test under a crowded change selection', async () => {
  const { index, change } = await fixture()
  change.changed = Array.from({ length: 50 }, (_, n) => ({ ...change.changed[0], symbol: { ...change.changed[0].symbol, name: `crowded${n}` } }))
  const brief = bounded(await buildReviewBrief(index, change))
  expect(brief.relations.length).toBeGreaterThan(0)
  expect(brief.tests.length).toBeGreaterThan(0)
  expect(brief.changes.some(row => row.code?.includes('return x + 2'))).toBe(true)
  expect(brief.omitted.changes).toBe(50 - brief.changes.length)
  expect(brief.changes.length).toBeLessThanOrEqual(REVIEW_LIMITS.changes)
  expect(brief.gaps).toContain('projection-row-cap')
})

it('keeps weakest path and last-hop grades separate, with no analysis mutation or DTO alias', async () => {
  const { index, change } = await fixture()
  const row = change.directCallers[0]
  change.impact.push({ ...row, depth: 2, resolution: 'name-only', symbol: { ...row.symbol, name: 'upstream' } })
  const before = JSON.stringify(change)
  const brief = bounded(await buildReviewBrief(index, change, 20000))
  const selected = brief.relations.find(row => row.kind === 'call' && row.name === 'upstream')!
  expect(selected).toMatchObject({ resolution: 'name-only', via: { resolution: row.via.resolution } })
  if (selected.kind === 'call') selected.via.reason = 'same-file' as never
  expect(JSON.stringify(change)).toBe(before)
})

it('keeps raw Context Pack and canonical change rendering unchanged after review selection', async () => {
  const { index, change } = await fixture()
  const before = await buildTaskContext(index, '分析 normalize 的修改影响', { budgetChars: 5000 })
  const text = renderChangeContext(change)
  await buildReviewBrief(index, change)
  expect((await buildTaskContext(index, '分析 normalize 的修改影响', { budgetChars: 5000 })).pack).toEqual(before.pack)
  expect(renderChangeContext(change)).toBe(text)
})

it('distinguishes missing source from budget signatures and retains whole source lines', async () => {
  const { root, index, change } = await fixture()
  const full = bounded(await buildReviewBrief(index, change, 20000))
  for (const row of full.changes.filter(row => row.code !== undefined && row.side === 'current')) {
    const lines = (await readFile(path.join(root, row.file), 'utf8')).split(/\r?\n/)
    expect(row.code).toBe(lines.slice(row.startLine - 1, row.endLine).join('\n'))
  }
  await rm(path.join(root, 'core.ts'))
  const missing = bounded(await buildReviewBrief(index, change))
  expect(missing.changes.find(row => row.name === 'normalize')).toMatchObject({ mode: 'signature', sourceGap: 'source-unavailable' })
  expect(missing.gaps).toContain('signature-only')
})

it('uses resolved base source for deletions', async () => {
  const { root } = await fixture(); await rm(path.join(root, 'core.ts'))
  const index = await buildIndex(root), change = await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' })
  git(root, 'add', '.'); git(root, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'move HEAD after analysis')
  expect(bounded(await buildReviewBrief(index, change)).changes).toContainEqual(expect.objectContaining({ side: 'base', ref: change.baseRef, code: 'export function normalize(x: number) { return x + 1 }' }))
})

it('distinguishes source too large for an excerpt from unavailable source', async () => {
  const { root } = await fixture()
  await writeFile(path.join(root, 'core.ts'), `export function normalize(x: number) { return '${'x'.repeat(2000)}' }\n`)
  const index = await buildIndex(root), change = await buildChangeContext(index, { kind: 'files', files: ['core.ts'] })
  const brief = bounded(await buildReviewBrief(index, change))
  expect(brief.changes[0]).toMatchObject({ mode: 'signature', sourceGap: 'source-budget' })
  expect(brief.gaps).not.toContain('source-unavailable')
})

it('treats an invalid declaration range as unavailable evidence, not a budget omission', async () => {
  const { index, change } = await fixture()
  change.changed[0].symbol = { ...change.changed[0].symbol, endLine: 10000 }
  const brief = bounded(await buildReviewBrief(index, change))
  expect(brief.changes[0]).toMatchObject({ mode: 'signature', sourceGap: 'source-unavailable' })
})

it('returns each linked worktree identity and source through the session-default tool path', async () => {
  const { root } = await fixture(), wt = path.join(root, 'worktree')
  git(root, 'worktree', 'add', '-qb', 'review-worktree', wt)
  await writeFile(path.join(wt, 'core.ts'), 'export function onlyWorktree() { return 82 }\n')
  const tool = tools.find(t => t.name === 'code_change_context')!
  const run = async (cwd: string) => bounded(await tool.execute({ files: ['core.ts'], outputFormat: 'review' },
    { agent: { session: { header: { cwd } } } } as never) as unknown as ReviewOutput)
  const a = await run(root), b = await run(wt), a2 = await run(root)
  expect(b.repository.root).toBe(wt)
  expect(b.changes.some(row => row.name === 'onlyWorktree' && row.code?.includes('return 82'))).toBe(true)
  expect(a.changes.some(row => row.name === 'onlyWorktree')).toBe(false)
  expect(a2.changes).toEqual(a.changes)
})

it.each([300, 500, 1000, 2000, 5000, 20000, -10, 1e9, NaN, Infinity])('enforces the complete JSON budget for %s', async budget => {
  const { index, change } = await fixture()
  const out = await buildReviewBrief(index, change, budget)
  const limit = Number.isFinite(budget) ? Math.max(300, Math.min(20000, Math.floor(budget))) : 5000
  expect(out.brief.budget.limit).toBe(limit)
  expect(out.brief.budget.usedChars).toBe(JSON.stringify(out).length)
  expect(out.brief.budget.usedChars).toBeLessThanOrEqual(limit)
  expect(out.brief.verification).toBe('not-run')
  if (out.brief.status === 'omitted') expect(out.brief.repository).toBeUndefined()
})

it('does not borrow Git metadata from a parent repository for a non-repo root', async () => {
  const { root } = await fixture(), nested = path.join(root, 'plain'); await mkdir(nested)
  await writeFile(path.join(nested, 'plain.ts'), 'export function plain() { return 1 }')
  const index = await buildIndex(nested), change = await buildChangeContext(index, { kind: 'files', files: ['plain.ts'] })
  expect(bounded(await buildReviewBrief(index, change)).repository).toMatchObject({ head: null, dirty: null })
})

it('does not add Git metadata commands for caller-supplied inline diffs', async () => {
  const { index, root } = await fixture()
  const change = await buildChangeContext(index, { kind: 'diff', root, text: '--- a/core.ts\n+++ b/core.ts\n@@ -1 +1 @@\n-old\n+new\n' })
  const spy = vi.mocked(childProcess.execFile).mockClear()
  const brief = bounded(await buildReviewBrief(index, change))
  expect(spy).not.toHaveBeenCalled()
  expect(brief.repository).toMatchObject({ head: null, dirty: null, baseRef: null })
  expect(brief.gaps).toContain('git-metadata-not-collected-for-inline-diff')
})

it('rejects cross-root analysis before building a review', async () => {
  const { index, change } = await fixture()
  await expect(buildReviewBrief(index, { ...change, root: index.root + '-other' })).rejects.toThrow('root mismatch')
})
