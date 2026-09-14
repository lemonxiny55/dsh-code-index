import { describe, expect, it } from 'vitest'
import { countReferences, rankRepoMap, renderRepoMap, resolveImport, scoreFile } from '../src/repomap.js'
import { REPO_INDEX_SCHEMA_VERSION, type IndexedFile, type RepoIndex } from '../src/types.js'

function file(path: string, kinds: string[]): IndexedFile {
  return {
    path,
    lang: 'typescript',
    mtimeMs: 1,
    symbols: kinds.map((k, i) => ({
      id: `sym:v1:${path}#${k}:sym${i}@1`,
      name: `${path.split('/').pop()}_${i}`,
      kind: k as IndexedFile['symbols'][number]['kind'],
      file: path,
      line: i + 1,
      endLine: i + 1,
      exported: i === 0,
      signature: '',
      scope: [],
      ordinal: 1,
    })),
  }
}

function makeIndex(): RepoIndex {
  return {
    schemaVersion: REPO_INDEX_SCHEMA_VERSION,
    root: '/tmp/repo',
    generatedAt: 0,
    excludedDirs: [],
    files: [
      file('src/core/engine.ts', ['class', 'class', 'method', 'method', 'function']),
      file('src/paperwork/notes.ts', ['variable', 'field', 'variable']),
      file('src/index.ts', ['function', 'function', 'function', 'function']),
    ],
  }
}

describe('scoreFile', () => {
  it('favours class/function rich files over variable litter', () => {
    const [engine, notes] = [scoreFile(makeIndex().files[0]), scoreFile(makeIndex().files[1])]
    expect(engine).toBeGreaterThan(notes)
  })

  it('downweights test-looking paths, even symbol-dense ones', () => {
    const src = file('src/core.ts', ['class', 'function'])
    const spec = file('src/core.spec.ts', [
      'function',
      'function',
      'function',
      'function',
      'function',
      'function',
    ])
    expect(scoreFile(spec)).toBeGreaterThan(0)
    expect(scoreFile(spec)).toBeLessThan(scoreFile(src))
  })

  it('recognises the common test path conventions', () => {
    const kinds = ['function', 'function']
    const baseline = scoreFile(file('pkg/core.ts', kinds))
    const damped: Record<string, boolean> = {}
    for (const p of [
      'pkg/__tests__/a.ts',
      'tests/a.ts',
      'test/a.ts',
      'pkg/a.test.tsx',
      'pkg/a.spec.mjs',
      'tests/test_core.py',
      'pkg/core_test.py',
      'pkg/core_test.go',
    ]) {
      damped[p] = scoreFile(file(p, kinds)) < baseline
    }
    expect(damped).toEqual({
      'pkg/__tests__/a.ts': true,
      'tests/a.ts': true,
      'test/a.ts': true,
      'pkg/a.test.tsx': true,
      'pkg/a.spec.mjs': true,
      'tests/test_core.py': true,
      'pkg/core_test.py': true,
      'pkg/core_test.go': true,
    })
    // and does not damp lookalike source paths
    for (const p of ['src/testing-utils.ts', 'src/intest.ts', 'src/latest.ts']) {
      expect(scoreFile(file(p, kinds))).toBe(baseline)
    }
  })
})

describe('rankRepoMap', () => {
  it('ranks by score and caps symbols per file', () => {
    const map = rankRepoMap(makeIndex(), { topFiles: 2, symbolsPerFile: 2 })
    expect(map).toHaveLength(2)
    expect(map[0].path).toBe('src/core/engine.ts')
    expect(map[0].symbols.length).toBe(2)
  })

  it('skips files without symbols', () => {
    const idx = makeIndex()
    idx.files.push(file('empty.ts', []))
    const map = rankRepoMap(idx)
    expect(map.some((e) => e.path === 'empty.ts')).toBe(false)
  })

  it('lifts heavily-imported files over denser but unreferenced ones', () => {
    const idx: RepoIndex = {
      schemaVersion: REPO_INDEX_SCHEMA_VERSION,
      root: '/tmp/repo',
      generatedAt: 0,
      excludedDirs: [],
      files: [
        file('src/core.ts', ['class', 'method']),
        file('src/core.spec.ts', Array.from({ length: 8 }, () => 'function')),
        file('src/a.ts', ['function']),
        file('src/b.ts', ['function']),
      ],
    }
    idx.files[2].imports = ['./core']
    idx.files[3].imports = ['./core', './a']
    const map = rankRepoMap(idx, { topFiles: 4 })
    // density + 2 incoming imports beats the denser (but damped) test file
    expect(map.map((e) => e.path)).toEqual([
      'src/core.ts',
      'src/a.ts',
      'src/b.ts',
      'src/core.spec.ts',
    ])
  })

  it('propagates importance transitively — a hub imported by other hubs wins', () => {
    const idx: RepoIndex = {
      schemaVersion: REPO_INDEX_SCHEMA_VERSION,
      root: '/tmp/repo',
      generatedAt: 0,
      excludedDirs: [],
      files: [
        file('src/core.ts', ['class', 'function']),
        file('src/mid.ts', ['class', 'function']),
        file('src/leaf.ts', ['class', 'function']),
      ],
    }
    idx.files[1].imports = ['./core']
    idx.files[2].imports = ['./mid']
    const map = rankRepoMap(idx, { topFiles: 3 })
    // core receives flow from mid, which itself receives flow from leaf —
    // flat in-degree (1 vs 1) cannot distinguish them, PageRank can.
    expect(map[0].path).toBe('src/core.ts')
    expect(map[0].score).toBeGreaterThan(map[1].score)
    expect(map[1].path).toBe('src/mid.ts')
  })

  it('keeps the density ordering when the import graph is empty', () => {
    const idx = makeIndex()
    const map = rankRepoMap(idx, { topFiles: 3 })
    const densities = idx.files
      .map((f) => f.path)
      .sort((a, b) => scoreFile(idx.files.find((f) => f.path === b)!) - scoreFile(idx.files.find((f) => f.path === a)!))
    expect(map.map((e) => e.path)).toEqual(densities)
  })

  it('is deterministic across runs', () => {
    const idx: RepoIndex = {
      schemaVersion: REPO_INDEX_SCHEMA_VERSION,
      root: '/tmp/repo',
      generatedAt: 0,
      excludedDirs: [],
      files: [
        file('src/a.ts', ['class']),
        file('src/b.ts', ['class']),
        file('src/c.ts', ['class']),
      ],
    }
    idx.files[0].imports = ['./b', './c']
    idx.files[1].imports = ['./a']
    const first = rankRepoMap(idx).map((e) => `${e.path}:${e.score}`)
    const second = rankRepoMap(idx).map((e) => `${e.path}:${e.score}`)
    expect(first).toEqual(second)
  })
})

describe('resolveImport', () => {
  const fileSet = new Set([
    'src/a.ts',
    'src/core.ts',
    'src/util/index.ts',
    'pkg/__init__.py',
    'pkg/deep.py',
  ])

  it('resolves relative specifiers with extension and index fallbacks', () => {
    expect(resolveImport('./core', 'src/a.ts', fileSet)).toBe('src/core.ts')
    expect(resolveImport('./util', 'src/a.ts', fileSet)).toBe('src/util/index.ts')
    expect(resolveImport('../core', 'src/nested/a.ts', fileSet)).toBe('src/core.ts')
    expect(resolveImport('./missing', 'src/a.ts', fileSet)).toBeNull()
  })

  it('resolves absolute specifiers from the root with a suffix fallback', () => {
    expect(resolveImport('pkg', 'src/a.ts', fileSet)).toBe('pkg/__init__.py')
    expect(resolveImport('example.com/foo/pkg/deep', 'src/a.ts', fileSet)).toBe('pkg/deep.py')
    expect(resolveImport('unknown/module', 'src/a.ts', fileSet)).toBeNull()
  })

  it('maps NodeNext ESM js specifiers back to their TS source', () => {
    const ts = new Set(['src/util.ts', 'src/view.tsx', 'src/mod.mts', 'src/legacy.cts'])
    expect(resolveImport('./util.js', 'src/a.ts', ts)).toBe('src/util.ts')
    expect(resolveImport('./view.js', 'src/a.ts', ts)).toBe('src/view.tsx')
    expect(resolveImport('./mod.mjs', 'src/a.ts', ts)).toBe('src/mod.mts')
    expect(resolveImport('./legacy.cjs', 'src/a.ts', ts)).toBe('src/legacy.cts')
    expect(resolveImport('./gone.js', 'src/a.ts', ts)).toBeNull()
  })
})

describe('countReferences', () => {
  it('counts in-repo imports once per importer and ignores self-imports', () => {
    const files = [
      { ...file('src/core.ts', ['class']), imports: ['./core'] },
      { ...file('src/a.ts', ['function']), imports: ['./core', './core', './a'] },
      { ...file('src/b.ts', ['function']), imports: ['./core'] },
      { ...file('src/c.ts', ['function']), imports: ['left-pad'] },
    ]
    const counts = countReferences(files)
    expect(counts.get('src/core.ts')).toBe(2) // a + b, not the self-import
    expect(counts.has('src/c.ts')).toBe(false)
    expect(counts.has('left-pad')).toBe(false)
  })
})

describe('renderRepoMap', () => {
  it('renders markdown and truncates', () => {
    const full = renderRepoMap(rankRepoMap(makeIndex()), { maxChars: 300 })
    expect(full).toMatch(/^# repo map/)
    expect(full).toContain('## src/core/engine.ts')
    expect(full.length).toBeLessThanOrEqual(320)
    if (full.length >= 300) {
      expect(full.endsWith('… truncated')).toBe(true)
    }
  })

  it('returns empty string when nothing to show', () => {
    expect(renderRepoMap([])).toBe('')
  })

  it('renders signatures to spare model inference', () => {
    const idx = makeIndex()
    // give engine.ts function a real signature
    const f = idx.files[0].symbols[4]
    f.signature = 'engine(rev: string)'
    const rendered = renderRepoMap(rankRepoMap(idx, { topFiles: 1 }))
    expect(rendered).toContain('function engine(rev: string) :5')
  })
})