import { describe, expect, it } from 'vitest'
import { buildModuleGraph, findCycles, findOrphanModules } from '../src/health.js'
import { REPO_INDEX_SCHEMA_VERSION, type IndexedFile, type RepoIndex, type SymbolInfo } from '../src/types.js'

function sym(name: string): SymbolInfo {
  return {
    id: `sym:v1:test#function:${name}@1`,
    name,
    kind: 'function',
    file: '',
    line: 1,
    endLine: 1,
    exported: true,
    signature: `${name}()`,
    scope: [],
    ordinal: 1,
  }
}

function file(path: string, imports: string[], symbolCount = 1): IndexedFile {
  return {
    path,
    lang: 'typescript',
    mtimeMs: 1,
    symbols: Array.from({ length: symbolCount }, (_, i) => ({ ...sym(`s${i}`), file: path })),
    imports,
  }
}

function index(files: IndexedFile[]): RepoIndex {
  return { schemaVersion: REPO_INDEX_SCHEMA_VERSION, root: '/tmp/repo', generatedAt: 0, excludedDirs: [], files }
}

describe('buildModuleGraph', () => {
  it('resolves import specifiers to files and drops self-edges', () => {
    const graph = buildModuleGraph(
      index([file('src/a.ts', ['./b', './a']), file('src/b.ts', [])]),
    )
    expect([...graph.edges.get('src/a.ts')!]).toEqual(['src/b.ts'])
    expect(graph.nodes).toEqual(['src/a.ts', 'src/b.ts'])
  })
})

describe('findCycles', () => {
  it('reports a two-file import cycle', () => {
    const cycles = findCycles(index([file('src/a.ts', ['./b']), file('src/b.ts', ['./a'])]))
    expect(cycles).toEqual([['src/a.ts', 'src/b.ts']])
  })

  it('is empty for a DAG', () => {
    const cycles = findCycles(
      index([file('src/a.ts', ['./b']), file('src/b.ts', ['./c']), file('src/c.ts', [])]),
    )
    expect(cycles).toEqual([])
  })

  it('is deterministic', () => {
    const repo = index([file('src/a.ts', ['./b']), file('src/b.ts', ['./a'])])
    expect(findCycles(repo)).toEqual(findCycles(repo))
  })
})

describe('findOrphanModules', () => {
  it('flags a symbol-bearing file nothing imports and that imports nothing', () => {
    const orphans = findOrphanModules(index([file('src/orphan.ts', []), file('src/used.ts', [])]))
    expect(orphans).toEqual(['src/orphan.ts', 'src/used.ts'])
  })

  it('excludes entry points and tests, and empty files', () => {
    const orphans = findOrphanModules(
      index([
        file('src/index.ts', []),
        file('src/x.spec.ts', []),
        file('src/empty.ts', [], 0),
        file('src/lonely.ts', []),
      ]),
    )
    expect(orphans).toEqual(['src/lonely.ts'])
  })

  it('excludes a file that is imported by another', () => {
    const orphans = findOrphanModules(index([file('src/a.ts', ['./b']), file('src/b.ts', [])]))
    expect(orphans).toEqual([])
  })
})
