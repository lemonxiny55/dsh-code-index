import { afterEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  buildChangeContext,
  changeContextInputFromArgs,
  renderChangeContext,
} from '../src/change-context.js'
import { tools } from '../src/tools.js'
import {
  REPO_INDEX_SCHEMA_VERSION,
  type CallInfo,
  type ImportInfo,
  type IndexedFile,
  type RepoIndex,
  type SymbolInfo,
} from '../src/types.js'

/* -------------------------------------------------------------------------- */
/* Synthetic index fixtures                                                   */
/* -------------------------------------------------------------------------- */

function encode(file: string): string {
  return file.replace(/\//g, '%2F')
}

function sym(
  file: string,
  name: string,
  kind: SymbolInfo['kind'],
  line: number,
  opts: { endLine?: number; exported?: boolean } = {},
): SymbolInfo {
  return {
    id: `sym:v1:${encode(file)}#${kind}:${name}@1`,
    name,
    kind,
    file,
    line,
    endLine: opts.endLine ?? line,
    exported: opts.exported ?? true,
    signature: `${name}()`,
    scope: [],
    ordinal: 1,
  }
}

function call(name: string, line: number, fromId: string, from: string): CallInfo {
  return { name, line, from, fromId, qualifier: null }
}

function imp(specifier: string, imported?: string, local?: string): ImportInfo {
  return {
    specifier,
    line: 1,
    kind: 'import',
    bindings:
      imported === undefined
        ? []
        : [{ imported, local: local ?? imported, kind: 'named' }],
  }
}

function file(
  filePath: string,
  symbols: SymbolInfo[],
  calls: CallInfo[] = [],
  importDetails: ImportInfo[] = [],
): IndexedFile {
  return {
    path: filePath,
    lang: 'typescript',
    mtimeMs: 1,
    symbols,
    calls,
    importDetails,
    imports: importDetails.map((info) => info.specifier),
  }
}

function repo(files: IndexedFile[]): RepoIndex {
  return {
    schemaVersion: REPO_INDEX_SCHEMA_VERSION,
    root: '/repo',
    generatedAt: 0,
    excludedDirs: [],
    files,
  }
}

const CORE = 'src/core.ts'
const USE = 'src/use.ts'
const DEEP = 'src/deep.ts'
const CORE_TEST = 'src/core.test.ts'
const USE_SPEC = 'src/use.spec.ts'
const DEEP_SPEC = 'src/deep.spec.ts'
const REF_TEST = 'src/ref.test.ts'
const CORE_SPEC = 'src/core.spec.ts'

const helper = sym(CORE, 'helper', 'function', 1, { endLine: 3 })
const main = sym(CORE, 'main', 'function', 5, { endLine: 8 })
const run = sym(USE, 'run', 'function', 1, { endLine: 5 })
const deep = sym(DEEP, 'deep', 'function', 1, { endLine: 5 })
const testHelper = sym(CORE_TEST, 'testHelper', 'function', 1, { endLine: 3, exported: false })
const testRef = sym(REF_TEST, 'testRef', 'function', 1, { endLine: 3, exported: false })
const specFn = sym(CORE_SPEC, 'specFn', 'function', 1, { exported: false })

const fixture = repo([
  file(CORE, [helper, main], [call('helper', 6, main.id, 'main')]),
  file(USE, [run], [call('main', 2, run.id, 'run')], [imp('./core', 'main')]),
  file(DEEP, [deep], [call('run', 2, deep.id, 'deep')], [imp('./use', 'run')]),
  file(CORE_TEST, [testHelper], [call('helper', 2, testHelper.id, 'testHelper')], [
    imp('./core', 'helper'),
  ]),
  file(USE_SPEC, [sym(USE_SPEC, 'useSpec', 'function', 1)], [], [imp('./use')]),
  file(DEEP_SPEC, [sym(DEEP_SPEC, 'deepSpec', 'function', 1)], [], [imp('./deep')]),
  file(REF_TEST, [testRef], [call('helper', 2, testRef.id, 'testRef')]),
  file(CORE_SPEC, [specFn]),
])

const TB_TARGET = 'src/tb-target.ts'
const TB_WEAK = 'src/tb-weak.ts'
const TB_STRONG = 'src/tb-strong.ts'
const TB_ENTRY = 'src/tb-entry.ts'
const tbTarget = sym(TB_TARGET, 'target', 'function', 1, { endLine: 2 })
const tbWeak = sym(TB_WEAK, 'weakCaller', 'function', 1, { endLine: 2, exported: false })
const tbStrong = sym(TB_STRONG, 'strongCaller', 'function', 1, { endLine: 2, exported: false })
const tbEntry = sym(TB_ENTRY, 'entryFn', 'function', 1, { endLine: 3 })
const tiebreakFixture = repo([
  file(TB_TARGET, [tbTarget]),
  file(TB_WEAK, [tbWeak], [call('target', 1, tbWeak.id, 'weakCaller')]),
  file(TB_STRONG, [tbStrong], [call('target', 1, tbStrong.id, 'strongCaller')], [
    imp('./tb-target', 'target'),
  ]),
  file(
    TB_ENTRY,
    [tbEntry],
    [
      call('weakCaller', 1, tbEntry.id, 'entryFn'),
      call('strongCaller', 2, tbEntry.id, 'entryFn'),
    ],
    [imp('./tb-weak', 'weakCaller'), imp('./tb-strong', 'strongCaller')],
  ),
])

const GONE = 'src/gone.ts'
const GONE_IMPORTER = 'src/gone-importer.ts'
const goneFixture = repo([
  file(GONE_IMPORTER, [sym(GONE_IMPORTER, 'useGone', 'function', 1)], [], [imp('./gone')]),
])
const goneDiff = [
  'diff --git a/src/gone.ts b/src/gone.ts',
  'deleted file mode 100644',
  '--- a/src/gone.ts',
  '+++ /dev/null',
  '@@ -1 +0,0 @@',
  '-export const gone = 1',
].join('\n')

const mappingDiff = [
  'diff --git a/src/core.ts b/src/core.ts',
  '--- a/src/core.ts',
  '+++ b/src/core.ts',
  '@@ -2,1 +2,1 @@',
  '-  return 1',
  '+  return 2',
  'diff --git a/src/core.test.ts b/src/core.test.ts',
  '--- a/src/core.test.ts',
  '+++ b/src/core.test.ts',
  '@@ -2,1 +2,1 @@',
  '-  helper()',
  '+  helper(1)',
].join('\n')

/* -------------------------------------------------------------------------- */
/* Input validation                                                           */
/* -------------------------------------------------------------------------- */

describe('changeContextInputFromArgs', () => {
  it('rejects mutually exclusive selections', () => {
    expect(() => changeContextInputFromArgs({ diff: 'x', files: ['a.ts'] }, '/r')).toThrow()
    expect(() => changeContextInputFromArgs({ files: ['a.ts'], symbols: ['s'] }, '/r')).toThrow()
  })

  it('rejects absolute and ..-escaping paths', () => {
    expect(() => changeContextInputFromArgs({ files: ['/abs/a.ts'] }, '/r')).toThrow()
    expect(() => changeContextInputFromArgs({ files: ['../a.ts'] }, '/r')).toThrow()
    expect(() => changeContextInputFromArgs({ files: ['src/../a.ts'] }, '/r')).toThrow()
  })

  it('defaults to git mode at HEAD and normalizes relative paths', () => {
    expect(changeContextInputFromArgs({}, '/r')).toEqual({
      kind: 'git',
      root: '/r',
      baseRef: 'HEAD',
    })
    expect(changeContextInputFromArgs({ files: ['./src/a.ts'] }, '/r')).toEqual({
      kind: 'files',
      files: ['src/a.ts'],
    })
    expect(changeContextInputFromArgs({ symbols: ['sym:1'] }, '/r')).toEqual({
      kind: 'symbols',
      symbolIds: ['sym:1'],
    })
  })

  it('leaves diff-mode baseRef undefined unless supplied, defaulting git mode to HEAD', () => {
    const bare = changeContextInputFromArgs({ diff: 'diff --git a/x b/x' }, '/r')
    expect(bare).toEqual({ kind: 'diff', root: '/r', text: 'diff --git a/x b/x' })
    expect('baseRef' in bare).toBe(false)
    expect(changeContextInputFromArgs({ diff: 'd', baseRef: 'base' }, '/r')).toEqual({
      kind: 'diff',
      root: '/r',
      text: 'd',
      baseRef: 'base',
    })
    expect(changeContextInputFromArgs({ baseRef: 'main' }, '/r')).toEqual({
      kind: 'git',
      root: '/r',
      baseRef: 'main',
    })
  })
})

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                   */
/* -------------------------------------------------------------------------- */

describe('buildChangeContext — files and symbols modes', () => {
  it('treats every symbol in a changed file as changed (files mode)', async () => {
    const result = await buildChangeContext(fixture, { kind: 'files', files: [CORE] })
    expect(result.source).toBe('files')
    expect(result.changed.map((entry) => entry.symbol.name).sort()).toEqual(['helper', 'main'])
    expect(result.changed.every((entry) => entry.side === 'current' && entry.change === 'modified')).toBe(
      true,
    )
    expect(result.warnings).toEqual([])
  })

  it('marks only explicit symbols as changed (symbols mode)', async () => {
    const result = await buildChangeContext(fixture, { kind: 'symbols', symbolIds: [helper.id] })
    expect(result.source).toBe('symbols')
    expect(result.changed.map((entry) => entry.symbol.name)).toEqual(['helper'])
    expect(result.directCallers.map((row) => row.symbol.name).sort()).toEqual([
      'main',
      'testHelper',
      'testRef',
    ])
    expect(
      result.directCallers.find((row) => row.symbol.name === 'testRef')!.resolution,
    ).toBe('name-only')
  })
})

describe('buildChangeContext — diff mapping and graph', () => {
  it('maps hunks to current-side symbols and walks callers / imports / impact', async () => {
    const result = await buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: mappingDiff })

    expect(result.changed.map((entry) => entry.symbol.name).sort()).toEqual(['helper', 'testHelper'])
    expect(result.changed.every((entry) => entry.side === 'current' && entry.resolution === 'exact')).toBe(
      true,
    )

    expect(result.directCallers.map((row) => row.symbol.name).sort()).toEqual([
      'main',
      'testHelper',
      'testRef',
    ])

    expect(result.importDependents.map((row) => `${row.file}<-${row.changedFile}`).sort()).toEqual([
      'src/core.test.ts<-src/core.ts',
      'src/use.ts<-src/core.ts',
    ])

    expect(result.impact.map((row) => `${row.symbol.name}@${row.depth}`)).toEqual(['run@2', 'deep@3'])
    // The run/deep hops are themselves import-bound (exact), but their path
    // starts at the sibling main->helper hop (name-only), so the whole path is
    // reported at its weakest link.
    expect(result.impact.every((row) => row.resolution === 'name-only')).toBe(true)
  })

  it('bounds transitive impact by maxDepth', async () => {
    const result = await buildChangeContext(fixture, {
      kind: 'diff',
      root: '/repo',
      text: mappingDiff,
    }, { maxDepth: 1 })
    expect(result.impact).toEqual([])
    expect(result.directCallers.map((row) => row.symbol.name).sort()).toEqual([
      'main',
      'testHelper',
      'testRef',
    ])
  })

  it('reports shortest entry-point paths, never fabricated from imports', async () => {
    const result = await buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: mappingDiff })
    const labels = result.paths.map(
      (symbolPath) => `${symbolPath.entry.name}->${symbolPath.changed.name}`,
    )
    expect(labels).toEqual(['main->helper', 'deep->helper', 'run->helper'])
    const deepest = result.paths.find((symbolPath) => symbolPath.entry.name === 'deep')!
    expect(deepest.hops.map((hop) => hop.fromId)).toEqual([deep.id, run.id, main.id])
    // main→helper is a same-file sibling call (not provably unshadowed), so its
    // hop is name-only; every path through it is weakest-link name-only, while
    // the import-bound run→main and deep→run hops stay exact.
    expect(deepest.hops.map((hop) => hop.resolution)).toEqual(['exact', 'exact', 'name-only'])
    expect(result.paths.find((symbolPath) => symbolPath.entry.name === 'main')!.resolution).toBe(
      'name-only',
    )
    expect(
      result.paths.find((symbolPath) => symbolPath.entry.name === 'deep')!.resolution,
    ).toBe('name-only')
    // Import-dependent spec files must not surface as symbol paths.
    expect(result.paths.some((symbolPath) => symbolPath.entry.file.endsWith('.spec.ts'))).toBe(false)
  })

  it('ranks affected tests and keeps path-name matches non-exact', async () => {
    const result = await buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: mappingDiff })
    expect(result.tests.map((test) => [path.basename(test.file), test.reason, test.resolution])).toEqual([
      ['core.test.ts', 'changed-test', 'exact'],
      ['use.spec.ts', 'imports-impact-file', 'import-scoped'],
      ['deep.spec.ts', 'imports-impact-file', 'import-scoped'],
      ['ref.test.ts', 'references-symbol-name', 'name-only'],
      ['core.spec.ts', 'path-convention', 'name-only'],
    ])
    const pathConvention = result.tests.filter((test) => test.reason === 'path-convention')
    expect(pathConvention.every((test) => test.resolution !== 'exact')).toBe(true)
  })

  it('reports an in-declaration insertion as outside-symbol unmapped', async () => {
    const diff = [
      'diff --git a/src/core.ts b/src/core.ts',
      '--- a/src/core.ts',
      '+++ b/src/core.ts',
      '@@ -20,3 +20,3 @@',
      '-a',
      '-b',
      '+c',
    ].join('\n')
    const result = await buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: diff })
    expect(result.changed).toEqual([])
    expect(result.unmapped).toEqual([
      {
        file: CORE,
        side: 'current',
        ranges: [{ startLine: 20, endLine: 22 }],
        reason: 'outside-symbol',
      },
    ])
  })

  it('reports base-content-unavailable for a deletion with no readable baseRef', async () => {
    const diff = [
      'diff --git a/src/core.ts b/src/core.ts',
      '--- a/src/core.ts',
      '+++ b/src/core.ts',
      '@@ -2,1 +2,0 @@',
      '-  return 1',
    ].join('\n')
    const result = await buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: diff })
    expect(result.changed).toEqual([])
    expect(result.unmapped[0]).toMatchObject({
      file: CORE,
      side: 'base',
      reason: 'base-content-unavailable',
      ranges: [{ startLine: 2, endLine: 2 }],
    })
  })
})

describe('buildChangeContext — diff path safety', () => {
  it('rejects absolute and ..-escaping paths parsed from a caller diff', async () => {
    const absolute = [
      'diff --git a/tmp/x.ts b/tmp/x.ts',
      '--- /tmp/x.ts',
      '+++ b/tmp/x.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n')
    await expect(
      buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: absolute }),
    ).rejects.toThrow()

    const escaping = [
      'diff --git a/../x.ts b/../x.ts',
      '--- a/../x.ts',
      '+++ b/../x.ts',
      '@@ -1 +1 @@',
      '-a',
      '+b',
    ].join('\n')
    await expect(
      buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: escaping }),
    ).rejects.toThrow()
  })

  it('resolves stale imports of a deleted file against the augmented file set', async () => {
    const result = await buildChangeContext(goneFixture, {
      kind: 'diff',
      root: '/repo',
      text: goneDiff,
    })
    expect(result.importDependents).toEqual([
      {
        file: GONE_IMPORTER,
        changedFile: GONE,
        specifier: './gone',
        resolution: 'import-scoped',
      },
    ])
  })
})

describe('buildChangeContext — path resolution strength', () => {
  it('reports transitive impact at the weakest hop of the whole path', async () => {
    const result = await buildChangeContext(fixture, {
      kind: 'diff',
      root: '/repo',
      text: mappingDiff,
    })
    expect(result.impact.map((row) => [row.symbol.name, row.resolution])).toEqual([
      ['run', 'name-only'],
      ['deep', 'name-only'],
    ])
  })

  it('prefers the stronger same-depth path in the BFS tiebreak', async () => {
    const result = await buildChangeContext(tiebreakFixture, {
      kind: 'symbols',
      symbolIds: [tbTarget.id],
    })
    const path = result.paths.find((symbolPath) => symbolPath.entry.name === 'entryFn')!
    expect(path.resolution).toBe('exact')
    expect(path.hops.map((hop) => hop.fromId)).toEqual([tbEntry.id, tbStrong.id])
    expect(result.impact.map((row) => [row.symbol.name, row.depth, row.resolution])).toEqual([
      ['entryFn', 2, 'exact'],
    ])
  })
})

describe('buildChangeContext — truncation flags', () => {
  it('flags capped sections and slices to the requested maxima', async () => {
    const result = await buildChangeContext(
      fixture,
      { kind: 'diff', root: '/repo', text: mappingDiff },
      { maxImpact: 1, maxPaths: 1, maxTests: 1 },
    )
    expect(result.directCallers).toHaveLength(1)
    expect(result.impact).toHaveLength(1)
    expect(result.paths).toHaveLength(1)
    expect(result.tests).toHaveLength(1)
    expect(result.importDependents).toHaveLength(1)
    expect(result.truncated).toEqual({
      callers: true,
      dependents: true,
      paths: true,
      impact: true,
      tests: true,
    })
  })
})

describe('renderChangeContext', () => {
  it('renders every section header and warnings under a generous cap', async () => {
    const result = await buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: mappingDiff })
    const text = renderChangeContext(result)
    for (const header of [
      'CHANGED:',
      'DIRECT CALLERS:',
      'IMPORT DEPENDENTS:',
      'SHORTEST PATHS TO ENTRY POINTS:',
      'TRANSITIVE IMPACT:',
      'LIKELY AFFECTED TESTS:',
      'UNMAPPED:',
      'WARNINGS:',
    ]) {
      expect(text).toContain(header)
    }
    expect(text).toContain('exact')
    expect(text).not.toContain('truncated')
  })

  it('keeps headers and warnings but trims rows under a tight cap', async () => {
    const result = await buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: mappingDiff })
    const text = renderChangeContext(result, 700)
    expect(text).toContain('CHANGED:')
    expect(text).toContain('WARNINGS:')
    expect(text).toContain('truncated')
    expect(text.length).toBeLessThanOrEqual(700)
  })

  it('never exceeds maxChars including the truncation note', async () => {
    const result = await buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: mappingDiff })
    expect(renderChangeContext(result).length).toBeGreaterThan(600)
    for (const cap of [600, 700, 800, 1000, 2000]) {
      const text = renderChangeContext(result, cap)
      expect(text.length).toBeLessThanOrEqual(cap)
      expect(text).toContain('CHANGED:')
      expect(text).toContain('WARNINGS:')
    }
  })

  it('rejects a cap too small to keep the fixed skeleton', async () => {
    const result = await buildChangeContext(fixture, { kind: 'diff', root: '/repo', text: mappingDiff })
    expect(() => renderChangeContext(result, 10)).toThrow()
  })
})

/* -------------------------------------------------------------------------- */
/* End-to-end Git mode                                                        */
/* -------------------------------------------------------------------------- */

const tempDirs: string[] = []
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

let gitAvailable = true
try {
  execFileSync('git', ['--version'], { stdio: 'pipe' })
} catch {
  gitAvailable = false
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

const execAt = (cwd: string) =>
  ({ agent: { session: { header: { cwd } } } }) as unknown as Parameters<
    (typeof tools)[number]['execute']
  >[1]

describe.skipIf(!gitAvailable)('code_change_context — git mode end to end', () => {
  it('maps a committed modification and a deletion against HEAD', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dsh-cix-change-'))
    tempDirs.push(root)
    await mkdir(path.join(root, 'src'), { recursive: true })
    await writeFile(
      path.join(root, 'src', 'core.ts'),
      ['export function helper() {', '  return 1', '}', 'export function main() { return helper() }', ''].join(
        '\n',
      ),
    )
    await writeFile(path.join(root, 'src', 'old.ts'), 'export function gone() {\n  return 1\n}\n')

    git(root, ['init', '-q'])
    git(root, ['config', 'user.email', 'test@example.com'])
    git(root, ['config', 'user.name', 'Test'])
    git(root, ['add', '.'])
    git(root, ['commit', '-qm', 'init'])

    // Uncommitted change: modify core.ts and delete old.ts.
    await writeFile(
      path.join(root, 'src', 'core.ts'),
      ['export function helper() {', '  return 2', '}', 'export function main() { return helper() }', ''].join(
        '\n',
      ),
    )
    await unlink(path.join(root, 'src', 'old.ts'))

    const tool = tools.find((entry) => entry.name === 'code_change_context')!
    const output = (await tool.execute({ repoRoot: root, baseRef: 'HEAD' }, execAt(root))) as string

    expect(output).toContain('source: git')
    expect(output).toContain('CHANGED:')
    expect(output).toContain('helper')
    expect(output).toContain('gone')
    expect(output).toContain('deleted base')
    expect(output).not.toContain('base-content-unavailable')
  })
})
