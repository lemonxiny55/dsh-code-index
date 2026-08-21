import { describe, expect, it } from 'vitest'
import { searchSymbols, renderHit } from '../src/search.js'
import type { RepoIndex } from '../src/types.js'

function makeIndex(): RepoIndex {
  return {
    root: '/tmp/repo',
    generatedAt: 0,
    excludedDirs: [],
    files: [
      {
        path: 'src/core/shapes.ts',
        lang: 'typescript',
        mtimeMs: 1,
        symbols: [
          { name: 'Shape', kind: 'interface', file: 'src/core/shapes.ts', line: 3, endLine: 6, exported: true, signature: '' },
          { name: 'draw', kind: 'function', file: 'src/core/shapes.ts', line: 9, endLine: 9, exported: true, signature: 'draw(s: Shape)' },
          { name: 'hidden_helper', kind: 'function', file: 'src/core/shapes.ts', line: 14, endLine: 14, exported: false, signature: '' },
        ],
      },
      {
        path: 'src/util/strings.ts',
        lang: 'typescript',
        mtimeMs: 1,
        symbols: [
          { name: 'capitalize', kind: 'function', file: 'src/util/strings.ts', line: 2, endLine: 4, exported: true, signature: 'capitalize(s: string)' },
          { name: 'cap', kind: 'type', file: 'src/util/strings.ts', line: 7, endLine: 7, exported: false, signature: '' },
        ],
      },
    ],
  }
}

describe('searchSymbols', () => {
  const index = makeIndex()

  it('scores exact > prefix > substring, exports first', () => {
    const hits = searchSymbols(index, { query: 'cap' }, 10)
    expect(hits[0].name).toBe('capitalize') // prefix 0.8 + exported
    expect(hits[1].name).toBe('cap') // exact-but-not-exported loses on export boost
    const exact = searchSymbols(index, { query: 'Shape' }, 10)
    expect(exact[0]).toMatchObject({ name: 'Shape', score: 1 })
  })

  it('filters by file substring', () => {
    const hits = searchSymbols(index, { file: 'util' }, 10)
    expect(hits.map((h) => h.file)).toEqual(['src/util/strings.ts', 'src/util/strings.ts'])
  })

  it('filters by kind and exportedOnly', () => {
    const kinds = searchSymbols(index, { kind: 'interface' }, 10)
    expect(kinds).toHaveLength(1)
    expect(kinds[0].name).toBe('Shape')
    const pub = searchSymbols(index, { exportedOnly: true, query: 'h' }, 10)
    expect(pub.every((h) => h.exported)).toBe(true)
  })

  it('empty query returns everything (score floor 0.4), exports first', () => {
    const all = searchSymbols(index, {}, 10)
    expect(all).toHaveLength(5)
    expect(all.slice(0, 3).every((h) => h.exported)).toBe(true)
    expect(all[0].name).toBe('capitalize') // score tie → name order
    expect(all.slice(3).every((h) => !h.exported)).toBe(true)
  })

  it('respects limit', () => {
    expect(searchSymbols(index, {}, 2)).toHaveLength(2)
  })
})

describe('renderHit', () => {
  it('renders a one-liner with score', () => {
    const hit = makeIndex().files[0].symbols[1]
    const text = renderHit({ ...hit, score: 1 })
    expect(text).toContain('export function draw(s: Shape)')
    expect(text).toContain('src/core/shapes.ts:9')
  })
})