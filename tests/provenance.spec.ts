import { describe, expect, it } from 'vitest'
import { extractAll } from '../src/extract.js'
import {
  buildReferenceGraph,
  buildSymbolTable,
  resolveCallTargets,
} from '../src/refgraph.js'
import {
  REPO_INDEX_SCHEMA_VERSION,
  type CallInfo,
  type ImportBinding,
  type ImportInfo,
  type IndexedFile,
  type RepoIndex,
  type ScopeKind,
  type SymbolInfo,
} from '../src/types.js'

function encode(file: string): string {
  return file.replace(/\//g, '%2F')
}

function sym(
  file: string,
  name: string,
  kind: SymbolInfo['kind'],
  line: number,
  opts: { scope?: string[]; seg?: string; endLine?: number } = {},
): SymbolInfo {
  const scope = opts.scope ?? []
  const seg = opts.seg ?? `${kind}:${name}@1`
  return {
    id: `sym:v1:${encode(file)}#${[...scope, seg].join('/')}`,
    name,
    kind,
    file,
    line,
    endLine: opts.endLine ?? line,
    exported: true,
    signature: `${name}()`,
    scope: scope.map((part) => {
      const [partKind, rest] = part.split(':')
      return {
        kind: partKind as ScopeKind,
        name: (rest ?? '').replace(/@\d+$/, ''),
        ordinal: 1,
      }
    }),
    ordinal: 1,
  }
}

function call(
  name: string,
  line: number,
  opts: { fromId?: string | null; from?: string; qualifier?: string | null } = {},
): CallInfo {
  return {
    name,
    line,
    from: opts.from ?? '',
    fromId: opts.fromId ?? null,
    qualifier: opts.qualifier ?? null,
  }
}

function binding(imported: string | null, local: string, kind: ImportBinding['kind']): ImportBinding {
  return { imported, local, kind }
}

function importInfo(specifier: string, bindings: ImportBinding[]): ImportInfo {
  return { specifier, line: 1, kind: 'import', bindings }
}

function indexed(
  path: string,
  symbols: SymbolInfo[],
  calls: CallInfo[],
  importDetails: ImportInfo[] = [],
): IndexedFile {
  return {
    path,
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

const RUN_OWNER = 'sym:v1:src%2Fa.ts#function:run@1'

describe('resolution provenance tiers', () => {
  it('tier 1: a unique local candidate is exact (local-unique)', () => {
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'helper', 'function', 1)],
      [call('helper', 5)],
    )
    const index = repo([source])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      targetId: 'sym:v1:src%2Fa.ts#function:helper@1',
      provenance: 'local-unique',
      resolution: 'exact',
      candidateCount: 1,
    })
  })

  it('tier 1: a recursive call to the owner stays structural-owner + exact', () => {
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1', endLine: 10 })],
      [call('run', 4, { fromId: RUN_OWNER, from: 'run' })],
    )
    const index = repo([source])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      provenance: 'structural-owner',
      resolution: 'exact',
      candidateCount: 1,
    })
  })

  it('tier 1: a same-scope sibling is not provably unshadowed — name-only', () => {
    const source = indexed(
      'src/a.ts',
      [
        sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1', endLine: 10 }),
        sym('src/a.ts', 'helper', 'function', 3, { seg: 'function:helper@1' }),
      ],
      [call('helper', 4, { fromId: RUN_OWNER, from: 'run' })],
    )
    const index = repo([source])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      provenance: 'local-unique',
      resolution: 'name-only',
      candidateCount: 1,
    })
  })

  it('tier 1: a module-level name called from inside a callable may be shadowed — name-only', () => {
    const source = indexed(
      'src/a.ts',
      [
        sym('src/a.ts', 'helper', 'function', 1),
        sym('src/a.ts', 'run', 'function', 10, { seg: 'function:run@1', endLine: 20 }),
      ],
      [call('helper', 12, { fromId: RUN_OWNER, from: 'run' })],
    )
    const index = repo([source])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      provenance: 'local-unique',
      resolution: 'name-only',
    })
    expect(edges[0]!.resolution).not.toBe('exact')
  })

  it('tier 1: two visible same-file definitions stay name-only', () => {
    const source = indexed(
      'src/a.ts',
      [
        sym('src/a.ts', 'foo', 'function', 1, { seg: 'function:foo@1' }),
        sym('src/a.ts', 'foo', 'function', 4, { seg: 'function:foo@2' }),
      ],
      [call('foo', 8)],
    )
    const index = repo([source])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(2)
    expect(edges.every((e) => e.resolution === 'name-only')).toBe(true)
    expect(edges.every((e) => e.candidateCount === 2)).toBe(true)
  })

  it('tier 2: an explicit TS import binding resolves exact', () => {
    const target = indexed('src/b.ts', [sym('src/b.ts', 'helper', 'function', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1', endLine: 9 })],
      [call('helper', 3, { fromId: RUN_OWNER, from: 'run' })],
      [importInfo('./b', [binding('helper', 'helper', 'named')])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      targetId: 'sym:v1:src%2Fb.ts#function:helper@1',
      provenance: 'explicit-import-binding',
      resolution: 'exact',
    })
  })

  it('tier 2: an aliased import resolves the imported name', () => {
    const target = indexed('src/b.ts', [sym('src/b.ts', 'helper', 'function', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1', endLine: 9 })],
      [call('h', 3, { fromId: RUN_OWNER, from: 'run' })],
      [importInfo('./b', [binding('helper', 'h', 'named')])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges[0]).toMatchObject({
      targetId: 'sym:v1:src%2Fb.ts#function:helper@1',
      provenance: 'explicit-import-binding',
      resolution: 'exact',
    })
  })

  it('tier 2: multiple definitions behind a binding become import-scoped', () => {
    const target = indexed(
      'src/b.ts',
      [
        sym('src/b.ts', 'helper', 'function', 1, { seg: 'function:helper@1' }),
        sym('src/b.ts', 'helper', 'function', 5, { seg: 'function:helper@2' }),
      ],
      [],
    )
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('helper', 3, { fromId: RUN_OWNER, from: 'run' })],
      [importInfo('./b', [binding('helper', 'helper', 'named')])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(2)
    expect(edges.every((e) => e.resolution === 'import-scoped')).toBe(true)
    expect(edges.every((e) => e.provenance === 'explicit-import-binding')).toBe(true)
  })

  it('tier 2: a python relative from-import resolves exact', () => {
    const target = indexed('pkg/mod.py', [sym('pkg/mod.py', 'helper', 'function', 1)], [])
    const source = indexed(
      'pkg/main.py',
      [sym('pkg/main.py', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('helper', 3, { fromId: 'sym:v1:pkg%2Fmain.py#function:run@1', from: 'run' })],
      [importInfo('./mod', [binding('helper', 'helper', 'named')])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      targetId: 'sym:v1:pkg%2Fmod.py#function:helper@1',
      provenance: 'explicit-import-binding',
      resolution: 'exact',
    })
  })

  it('tier 3: a namespace qualifier call is import-scoped, never exact', () => {
    const target = indexed('src/b.ts', [sym('src/b.ts', 'helper', 'function', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('helper', 3, { fromId: RUN_OWNER, from: 'run', qualifier: 'ns' })],
      [importInfo('./b', [binding('*', 'ns', 'namespace')])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      targetId: 'sym:v1:src%2Fb.ts#function:helper@1',
      provenance: 'namespace-import',
      resolution: 'import-scoped',
    })
    expect(edges[0]!.resolution).not.toBe('exact')
  })

  it('tier 4: a name in a resolved imported module is import-scoped', () => {
    const target = indexed('src/b.ts', [sym('src/b.ts', 'helper', 'function', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('helper', 3, { fromId: RUN_OWNER, from: 'run' })],
      [importInfo('./b', [])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      provenance: 'resolved-import-module',
      resolution: 'import-scoped',
    })
  })

  it('tier 5: an ambiguous repo-wide name is name-only', () => {
    const defs = ['src/x.ts', 'src/y.ts', 'src/z.ts'].map((file) =>
      indexed(file, [sym(file, 'foo', 'function', 1)], []),
    )
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('foo', 3, { fromId: RUN_OWNER, from: 'run' })],
    )
    const index = repo([source, ...defs])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(3)
    expect(edges.every((e) => e.provenance === 'global-name')).toBe(true)
    expect(edges.every((e) => e.resolution === 'name-only')).toBe(true)
    expect(edges.every((e) => e.candidateCount === 3)).toBe(true)
  })

  it('finding #4: a qualified call is not captured by a same-file bare name', () => {
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'foo', 'function', 1), sym('src/a.ts', 'save', 'function', 5)],
      [call('foo', 9, { qualifier: 'ns' }), call('save', 10, { qualifier: 'obj' })],
    )
    const index = repo([source])
    const table = buildSymbolTable(index)
    const fooEdges = resolveCallTargets(index, source, source.calls![0]!, table, 8)
    const saveEdges = resolveCallTargets(index, source, source.calls![1]!, table, 8)
    expect(fooEdges).toHaveLength(1)
    expect(fooEdges[0]).toMatchObject({ provenance: 'global-name', resolution: 'name-only' })
    expect(saveEdges[0]).toMatchObject({ provenance: 'global-name', resolution: 'name-only' })
  })

  it('finding #6: a re-export does not bind a local name', () => {
    const target = indexed('src/b.ts', [sym('src/b.ts', 'foo', 'function', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('foo', 3, { fromId: RUN_OWNER, from: 'run' })],
      [
        {
          specifier: './b',
          line: 1,
          kind: 'reexport',
          bindings: [binding('foo', 'foo', 'named')],
        },
      ],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      targetId: 'sym:v1:src%2Fb.ts#function:foo@1',
      provenance: 'global-name',
      resolution: 'name-only',
    })
    expect(edges[0]!.resolution).not.toBe('exact')
  })

  it('finding #7: a default import resolves import-scoped, never exact', () => {
    const target = indexed('src/b.ts', [sym('src/b.ts', 'Component', 'class', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('Component', 3, { fromId: RUN_OWNER, from: 'run' })],
      [importInfo('./b', [binding('default', 'Component', 'default')])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      targetId: 'sym:v1:src%2Fb.ts#class:Component@1',
      provenance: 'explicit-import-binding',
      resolution: 'import-scoped',
    })
    expect(edges[0]!.resolution).not.toBe('exact')
  })

  it('finding #7: a default import whose alias matches nothing emits the module exports', () => {
    const target = indexed('src/b.ts', [sym('src/b.ts', 'Widget', 'class', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('Component', 3, { fromId: RUN_OWNER, from: 'run' })],
      [importInfo('./b', [binding('default', 'Component', 'default')])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      targetId: 'sym:v1:src%2Fb.ts#class:Widget@1',
      provenance: 'explicit-import-binding',
      resolution: 'import-scoped',
    })
  })

  it('finding #12: an unbound qualifier is not namespace-import', () => {
    const target = indexed('src/utils.ts', [sym('src/utils.ts', 'foo', 'function', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('foo', 3, { fromId: RUN_OWNER, from: 'run', qualifier: 'utils' })],
      [importInfo('./utils', [binding('x', 'x', 'named')])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ provenance: 'global-name', resolution: 'name-only' })
    expect(edges[0]!.provenance).not.toBe('namespace-import')
  })

  it('finding #12: a binding-less include may infer the qualifier but stays import-scoped', () => {
    const target = indexed('src/utils.ts', [sym('src/utils.ts', 'foo', 'function', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('foo', 3, { fromId: RUN_OWNER, from: 'run', qualifier: 'utils' })],
      [{ specifier: './utils', line: 1, kind: 'include', bindings: [] }],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({ provenance: 'namespace-import', resolution: 'import-scoped' })
    expect(edges[0]!.resolution).not.toBe('exact')
  })

  it('finding #13: a NodeNext .js specifier resolving to a .ts source can be exact', () => {
    const target = indexed('src/b.ts', [sym('src/b.ts', 'helper', 'function', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('helper', 3, { fromId: RUN_OWNER, from: 'run' })],
      [importInfo('./b.js', [binding('helper', 'helper', 'named')])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      targetId: 'sym:v1:src%2Fb.ts#function:helper@1',
      provenance: 'explicit-import-binding',
      resolution: 'exact',
    })
  })

  it('finding #13: a nested-segment suffix fallback does not elevate to exact', () => {
    const target = indexed('pkg/deep.ts', [sym('pkg/deep.ts', 'helper', 'function', 1)], [])
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('helper', 3, { fromId: RUN_OWNER, from: 'run' })],
      [importInfo('example.com/foo/pkg/deep', [binding('helper', 'helper', 'named')])],
    )
    const index = repo([source, target])
    const edges = resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8)
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      targetId: 'sym:v1:pkg%2Fdeep.ts#function:helper@1',
      provenance: 'explicit-import-binding',
      resolution: 'import-scoped',
    })
  })

  it('emits no edge when nothing in-repo matches the name', () => {
    const source = indexed(
      'src/a.ts',
      [sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1' })],
      [call('missing', 3, { fromId: RUN_OWNER, from: 'run' })],
    )
    const index = repo([source])
    expect(
      resolveCallTargets(index, source, source.calls![0]!, buildSymbolTable(index), 8),
    ).toEqual([])
    const graph = buildReferenceGraph(index)
    expect(graph.outgoing.size).toBe(0)
    expect(graph.incoming.size).toBe(0)
    expect(graph.moduleLevelEdges).toEqual([])
  })
})

describe('buildReferenceGraph', () => {
  it('populates moduleLevelEdges for ownerless calls and keys incoming by target', () => {
    const target = indexed('src/b.ts', [sym('src/b.ts', 'helper', 'function', 1)], [])
    const source = indexed('src/a.ts', [sym('src/a.ts', 'run', 'function', 1)], [call('helper', 2)])
    const index = repo([source, target])
    const graph = buildReferenceGraph(index)

    expect(graph.outgoing.size).toBe(0)
    expect(graph.moduleLevelEdges).toHaveLength(1)
    const edge = graph.moduleLevelEdges[0]!
    expect(edge.sourceId).toBeNull()
    expect(edge.targetId).toBe('sym:v1:src%2Fb.ts#function:helper@1')
    expect(edge.provenance).toBe('global-name')
    expect(edge.resolution).toBe('name-only')
    expect(graph.incoming.get(edge.targetId)).toEqual([edge])
    expect(graph.symbolsById.size).toBe(2)
  })

  it('keys outgoing by the structural owner', () => {
    const source = indexed(
      'src/a.ts',
      [
        sym('src/a.ts', 'run', 'function', 1, { seg: 'function:run@1', endLine: 9 }),
        sym('src/a.ts', 'helper', 'function', 3, { seg: 'function:helper@1' }),
      ],
      [call('helper', 4, { fromId: RUN_OWNER, from: 'run' })],
    )
    const graph = buildReferenceGraph(repo([source]))
    expect(graph.moduleLevelEdges).toEqual([])
    const edges = graph.outgoing.get(RUN_OWNER)
    expect(edges).toHaveLength(1)
    expect(edges![0]!.targetId).toBe('sym:v1:src%2Fa.ts#function:helper@1')
  })

  it('caps emitted edges per call without hiding the true candidate count', () => {
    const defs = Array.from({ length: 10 }, (_, i) =>
      indexed(`src/f${i}.ts`, [sym(`src/f${i}.ts`, 'foo', 'function', 1)], []),
    )
    const source = indexed('src/a.ts', [sym('src/a.ts', 'run', 'function', 1)], [call('foo', 2)])
    const graph = buildReferenceGraph(repo([source, ...defs]), { maxCandidatesPerCall: 2 })

    expect(graph.moduleLevelEdges).toHaveLength(2)
    expect(graph.moduleLevelEdges.every((e) => e.candidateCount === 10)).toBe(true)
    // Every emitted target is a real in-repo definition.
    expect(graph.moduleLevelEdges.every((e) => graph.symbolsById.has(e.targetId))).toBe(true)
  })
})

describe('provenance over real extraction', () => {
  it('resolves a real TS import binding to exact end to end', async () => {
    const files = new Map<string, string>([
      ['src/a.ts', "import { helper } from './b'\nexport function run() {\n  helper()\n}\n"],
      ['src/b.ts', 'export function helper() {}\n'],
    ])
    const indexedFiles: IndexedFile[] = []
    for (const [file, text] of files) {
      const extracted = await extractAll(text, 'typescript', file)
      indexedFiles.push({
        path: file,
        lang: 'typescript',
        mtimeMs: 1,
        symbols: extracted.symbols,
        calls: extracted.calls,
        imports: extracted.imports,
        importDetails: extracted.importDetails,
      })
    }
    const graph = buildReferenceGraph(repo(indexedFiles))
    const run = indexedFiles
      .find((f) => f.path === 'src/a.ts')!
      .symbols.find((s) => s.name === 'run')!
    const edges = graph.outgoing.get(run.id)
    expect(edges).toHaveLength(1)
    const helper = indexedFiles
      .find((f) => f.path === 'src/b.ts')!
      .symbols.find((s) => s.name === 'helper')!
    expect(edges![0]).toMatchObject({
      sourceId: run.id,
      targetId: helper.id,
      provenance: 'explicit-import-binding',
      resolution: 'exact',
    })
  })
})
