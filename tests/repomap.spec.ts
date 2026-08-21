import { describe, expect, it } from 'vitest'
import { rankRepoMap, renderRepoMap, scoreFile } from '../src/repomap.js'
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