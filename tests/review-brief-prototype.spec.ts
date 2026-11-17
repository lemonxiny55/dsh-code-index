import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { buildIndex } from '../src/buildIndex.js'
import { buildChangeContext } from '../src/change-context.js'
import { buildTaskContext } from '../src/context.js'
import { buildReviewBrief } from '../prototypes/review-brief.js'

let root = ''
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = '' })
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
async function fixture() {
  root = await mkdtemp(path.join(os.tmpdir(), 'review-brief-'))
  await mkdir(path.join(root, 'tests'))
  await writeFile(path.join(root, 'core.ts'), 'export function normalize(x: number) { return x + 1 }\n')
  await writeFile(path.join(root, 'caller.ts'), "import { normalize } from './core'\nexport function caller() { return normalize(1) }\n")
  await writeFile(path.join(root, 'tests/core.test.ts'), "import { normalize } from '../core'\nexport function candidate() { return normalize(2) }\n")
  git('init', '-q'); git('add', '.'); git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'base')
  await writeFile(path.join(root, 'core.ts'), 'export function normalize(x: number) { return x + 2 }\n')
  const index = await buildIndex(root)
  return { index, change: await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' }) }
}

it('preserves source lines, static grades, test uncertainty and repository identity', async () => {
  const { index, change } = await fixture()
  const out = await buildReviewBrief(index, change)
  expect(out.text).toContain('return x + 2')
  expect(out.brief.repository?.head).toBe(git('rev-parse', 'HEAD').trim())
  expect(out.brief.verification).toBe('not-run')
  expect(out.brief.tests?.some(row => row.file === 'tests/core.test.ts')).toBe(true)
  for (const row of out.brief.relations ?? []) expect(change.impact.some(original => original.symbol.name === row.name && original.resolution === row.resolution)).toBe(true)
  expect(JSON.stringify(out).length).toBeLessThanOrEqual(5000)
})

it('uses immutable base source for deletions', async () => {
  await fixture()
  await rm(path.join(root, 'core.ts'))
  const index = await buildIndex(root)
  const change = await buildChangeContext(index, { kind: 'git', root, baseRef: 'HEAD' })
  const out = await buildReviewBrief(index, change)
  expect(out.brief.changes?.some(row => row.side === 'base' && row.ref && row.code?.includes('return x + 1'))).toBe(true)
})

it('never represents stale source as executable evidence', async () => {
  const { index, change } = await fixture()
  await rm(path.join(root, 'core.ts'))
  const out = await buildReviewBrief(index, change)
  expect(out.brief.changes?.some(row => row.file === 'core.ts' && row.side === 'current' && row.code !== undefined)).toBe(false)
  expect(out.brief.gaps.join(';')).toContain('signature-only')
})

it('charges the complete envelope at default, lower and upper budgets', async () => {
  const { index, change } = await fixture()
  for (const budget of [300, 500, 1000, 5000, 20000]) {
    const out = await buildReviewBrief(index, change, budget)
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(budget)
    expect(out.brief.gaps.length).toBeGreaterThan(0)
    expect(out.brief.verification).toBe('not-run')
  }
})

it('does not mutate raw Context Pack selection or analysis', async () => {
  const { index, change } = await fixture()
  const before = await buildTaskContext(index, '分析 normalize 的修改影响', { budgetChars: 5000 })
  const rawChange = JSON.stringify(change)
  await buildReviewBrief(index, change)
  expect(JSON.stringify(change)).toBe(rawChange)
  expect((await buildTaskContext(index, '分析 normalize 的修改影响', { budgetChars: 5000 })).pack).toEqual(before.pack)
})

it('rejects evidence from another repository', async () => {
  const { index, change } = await fixture()
  await expect(buildReviewBrief(index, { ...change, root: root + '-other' })).rejects.toThrow('root mismatch')
})
