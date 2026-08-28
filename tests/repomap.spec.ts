import { describe, expect, it } from 'vitest'
import { countReferences, rankRepoMap, renderRepoMap, resolveImport, scoreFile } from '../src/repomap.js'
import type { IndexedFile, RepoIndex } from '../src/types.js'

function file(path: string, kinds: string[]): IndexedFile {
  return {
    path,
    lang: 'typescript',
    mtimeMs: 1,
    symbols: kinds.map((k, i) => ({
      name: `${path.split('/').pop()}_${i}`,
      kind: k as IndexedFile['symbols'][number]['kind'],
      file: path,
      line: i + 1,
      endLine: i + 1,
      exported: i === 0,
      signature: '',
    })),
  }
}

function makeIndex(): RepoIndex {
  return {
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