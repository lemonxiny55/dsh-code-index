import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildIndex } from '../src/buildIndex.js'
import { buildTaskContext, renderTaskContext } from '../src/context.js'
import type { RepoIndex } from '../src/types.js'
import cases from './fixtures/context-c-phase/cases.json'
import sources from './fixtures/context-c-phase/sources.json'

const roots: string[] = []
const indexes = new Map<string, RepoIndex>()
const measurements: unknown[] = []
const git = (root: string, ...args: string[]) => execFileSync('git', ['-C', root, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
})

beforeAll(async () => {
  // Optional read-only replay against the original complete C3 trial trees.
  if (process.env.CONTEXT_QUALITY_TRIALS_DIR) {
    for (const sample of cases) indexes.set(sample.id,
      await buildIndex(path.join(process.env.CONTEXT_QUALITY_TRIALS_DIR, sample.id)))
    return
  }
  // Nine frozen real files retain the original scanner/index/tool path and
  // the four misleading repo helpers. No historical checkout or model needed.
  for (const changed of [false, true]) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'cix-c-phase-')); roots.push(root)
    for (const [file, code] of Object.entries(sources.files)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true })
      await writeFile(path.join(root, file), code)
    }
    git(root, 'init', '-q'); git(root, 'config', 'user.email', 'test@example.invalid')
    git(root, 'config', 'user.name', 'C phase regression'); git(root, 'add', '.')
    git(root, 'commit', '-qm', 'historical Gitignore baseline')
    if (changed) for (const [file, code] of Object.entries(sources.fixed)) await writeFile(path.join(root, file), code)
    const index = await buildIndex(root)
    for (const sample of cases) if (sample.id.startsWith('T3') === changed) indexes.set(sample.id, index)
  }
}, 30_000)

afterAll(async () => {
  if (process.env.CONTEXT_QUALITY_REPORT) await writeFile(process.env.CONTEXT_QUALITY_REPORT,
    JSON.stringify({ method: `direct buildTaskContext on ${process.env.CONTEXT_QUALITY_TRIALS_DIR ? 'original full C3 trials' : 'reduced frozen historical source'}; not Agent/Host`,
      environment: { node: process.version, platform: process.platform, arch: process.arch },
      fixture: { before: sources.before, after: sources.after, fileCount: Object.keys(sources.files).length }, measurements }, null, 2) + '\n')
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
})

describe('C phase six real Context Pack inputs', () => {
  for (const sample of cases) it(sample.id, async () => {
    const index = indexes.get(sample.id)!
    const result = await buildTaskContext(index, sample.input.task, { budgetChars: sample.input.budgetChars })
    const pack = result.pack
    const text = renderTaskContext(result)
    const recalled = sample.requiredSource.filter(name => pack.items.some(item => item.name === name && item.code !== undefined))
    const noise = result.primarySymbols.filter(seed => sample.forbiddenPrimaryFiles.includes(seed.symbol.file))
      .map(seed => `${seed.symbol.file}:${seed.symbol.name}`)
    measurements.push({ id: sample.id, input: sample.input, expectedSource: sample.requiredSource,
      recalled, missing: sample.requiredSource.filter(name => !recalled.includes(name)), unrelatedPrimary: noise,
      route: pack.route, textChars: text.length, packChars: JSON.stringify(pack).length,
      budgetChars: pack.budget.budgetChars, gaps: pack.gaps,
      evidence: pack.evidence,
      items: pack.items.map(({ kind, name, file, startLine, endLine, code, mode, reason, resolution, provenance, change }) =>
        ({ kind, name, file, startLine, endLine, code, mode, reason, resolution, provenance, change })),
    })
    // Soft assertions collect every symptom for a useful red/green baseline.
    expect.soft(pack.route).toBe(sample.expectedRoute)
    expect.soft(result.route.exactSymbolNames).not.toContain('repo')
    expect.soft(noise).toEqual([])
    expect.soft(recalled).toEqual(sample.requiredSource)
    const requiredCode: Record<string, string> = {
      isGitIgnoredPath: sample.id.startsWith('T3') ? 'ignoredByGitLayers(layers, probe' : 'matcher?.ignores(scoped)',
      scanRepo: sample.id.startsWith('T3') ? 'ignoredByGitLayers(layers, rel' : 'matcher.ignores(scoped)',
      buildIndex: 'await scanRepo(root, options)', buildIndexWithCache: 'await buildIndex(root, options',
      getIndex: 'buildIndexWithCache(root', attachWatcher: 'isGitIgnoredPath(context.root, rel',
      refresh: 'buildIndexWithCache(context.root', ignoredByGitLayers: 'matcher.test(',
    }
    for (const name of sample.requiredSource) expect.soft(pack.items.some(item => item.name === name &&
      item.code?.includes(requiredCode[name])), `${name} must include task-relevant implementation`).toBe(true)
    expect.soft(text.length).toBeLessThanOrEqual(sample.input.budgetChars)
    expect.soft(JSON.stringify(pack).length).toBeLessThanOrEqual(sample.input.budgetChars)
    expect.soft(pack.budget.usedChars).toBe(text.length)
    expect.soft(pack.budget.packChars).toBe(JSON.stringify(pack).length)
    expect.soft(pack.items.filter(item => item.kind === 'test').every(item => item.reason.includes('candidate'))).toBe(true)
    expect.soft(text).toContain('not verified coverage')
    if (sample.id.startsWith('T3')) {
      expect.soft(pack.items.some(item => item.file === 'src/scan.ts' && item.change === 'modified')).toBe(true)
      expect.soft(pack.items.some(item => item.file === 'src/repo-context.ts' && item.change === 'modified')).toBe(true)
    }
    for (const item of pack.items) if (item.code !== undefined) {
      const code = item.side === 'base' ? git(index.root, 'show', `${item.ref}:${item.file}`)
        : await readFile(path.join(index.root, item.file!), 'utf8')
      expect(item.code).toBe(code.split(/\r?\n/).slice(item.startLine! - 1, item.endLine).join('\n'))
    }
  }, 15_000)
})
