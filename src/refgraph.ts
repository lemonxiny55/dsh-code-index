/** Function-level call graph built from the cached index — pure, no IO. */

import { resolveImport, resolveImportDetailed } from './repomap.js'
import type {
  CallInfo,
  ImportBinding,
  IndexedFile,
  RepoIndex,
  SymbolId,
  SymbolInfo,
} from './types.js'

/** name -> definitions; several when same-named symbols live in different files. */
export function buildSymbolTable(index: RepoIndex): Map<string, SymbolInfo[]> {
  const table = new Map<string, SymbolInfo[]>()
  for (const file of index.files) {
    for (const symbol of file.symbols) {
      const list = table.get(symbol.name)
      if (list) list.push(symbol)
      else table.set(symbol.name, [symbol])
    }
  }
  for (const list of table.values()) {
    list.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  }
  return table
}

/** One call site that invokes the queried symbol. */
export interface CallerHit {
  file: string
  line: number
  from: string
}

/** One distinct symbol the queried function calls, with its first call line. */
export interface CalleeHit {
  name: string
  line: number
  /** In-repo definitions matched by the callee name. */
  targets: SymbolInfo[]
}

export interface SymbolRefs {
  /** Definitions of the queried symbol (empty when only call sites exist). */
  defs: SymbolInfo[]
  callers: CallerHit[]
  callees: CalleeHit[]
}

/** How many call sites reference each name — used to rank search hits. */
export function callerCounts(index: RepoIndex): Map<string, number> {
  const counts = new Map<string, number>()
  for (const file of index.files) {
    for (const call of file.calls ?? []) {
      counts.set(call.name, (counts.get(call.name) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * Resolve one symbol to its callers (call sites invoking it anywhere) and its
 * callees (calls made inside the definition, attributed by the extracted
 * enclosing-function name). Name-based, so it is a best-effort view: like-named
 * symbols are reported as candidates rather than guessed apart.
 */
export function symbolRefs(index: RepoIndex, symbol: string, limit = 200): SymbolRefs {
  const table = buildSymbolTable(index)
  const defs = table.get(symbol) ?? []

  const callers: CallerHit[] = []
  const calleeFirstLine = new Map<string, number>()
  for (const file of index.files) {
    for (const call of file.calls ?? []) {
      if (call.name === symbol) {
        callers.push({ file: file.path, line: call.line, from: call.from })
      }
      if (call.from === symbol && !calleeFirstLine.has(call.name)) {
        calleeFirstLine.set(call.name, call.line)
      }
    }
  }

  callers.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.from.localeCompare(b.from),
  )

  const callees: CalleeHit[] = [...calleeFirstLine.entries()]
    .map(([name, line]) => ({ name, line, targets: table.get(name) ?? [] }))
    .sort((a, b) => a.line - b.line || a.name.localeCompare(b.name))

  return {
    defs,
    callers: callers.slice(0, limit),
    callees: callees.slice(0, limit),
  }
}

/* -------------------------------------------------------------------------- */
/* Provenance-labeled reference graph (design §2)                             */
/* -------------------------------------------------------------------------- */

/**
 * How sure the graph is about one resolved edge. Deliberately coarse: the
 * index has no type checker, so `exact` only ever means "one structurally
 * unambiguous target under this index's model".
 */
export type ResolutionLabel = 'exact' | 'import-scoped' | 'name-only'

/** Which resolution tier produced an edge — the *why* behind its label. */
export type ResolutionProvenance =
  | 'structural-owner'
  | 'local-unique'
  | 'explicit-import-binding'
  | 'namespace-import'
  | 'resolved-import-module'
  | 'global-name'

/** One resolved call edge; one row per candidate target. */
export interface ReferenceEdge {
  /** Call's structural owner, or null for a module-level call. */
  sourceId: SymbolId | null
  targetId: SymbolId
  callSite: { file: string; line: number }
  /** Callee name as written at the call site. */
  name: string
  provenance: ResolutionProvenance
  resolution: ResolutionLabel
  /** Total candidates produced at this tier (may exceed the emitted edges). */
  candidateCount: number
}

/** Adjacency views over the same edge set, plus ownerless call sites. */
export interface ReferenceGraph {
  symbolsById: Map<SymbolId, SymbolInfo>
  /** sourceId -> edges it emits. */
  outgoing: Map<SymbolId, ReferenceEdge[]>
  /** targetId -> edges that point at it (including module-level calls). */
  incoming: Map<SymbolId, ReferenceEdge[]>
  /** Edges whose call site has no structural owner. */
  moduleLevelEdges: ReferenceEdge[]
}

export interface ReferenceGraphOptions {
  /** Max candidate targets emitted per call site (default 8). */
  maxCandidatesPerCall?: number
}

const DEFAULT_MAX_CANDIDATES = 8

/**
 * Build the provenance-labeled reference graph for an index. Pure: reads the
 * cached index only. Existing `code_refs` helpers above keep their name-based
 * behavior; this graph is the precise-by-provenance successor.
 */
export function buildReferenceGraph(
  index: RepoIndex,
  options: ReferenceGraphOptions = {},
): ReferenceGraph {
  const maxCandidates = options.maxCandidatesPerCall ?? DEFAULT_MAX_CANDIDATES
  const symbolsById = new Map<SymbolId, SymbolInfo>()
  const symbolsByFile = new Map<string, SymbolInfo[]>()
  for (const file of index.files) {
    for (const symbol of file.symbols) symbolsById.set(symbol.id, symbol)
    symbolsByFile.set(file.path, file.symbols)
  }
  const symbolsByName = buildSymbolTable(index)
  const fileSet = new Set(index.files.map((file) => file.path))

  const outgoing = new Map<SymbolId, ReferenceEdge[]>()
  const incoming = new Map<SymbolId, ReferenceEdge[]>()
  const moduleLevelEdges: ReferenceEdge[] = []

  for (const file of index.files) {
    for (const call of file.calls ?? []) {
      const edges = resolveCallTargetsFor(
        fileSet,
        file,
        call,
        symbolsByName,
        symbolsByFile,
        maxCandidates,
      )
      if (edges.length === 0) continue
      if (call.fromId) {
        appendEdges(outgoing, call.fromId, edges)
      } else {
        moduleLevelEdges.push(...edges)
      }
      for (const edge of edges) appendEdges(incoming, edge.targetId, [edge])
    }
  }

  return { symbolsById, outgoing, incoming, moduleLevelEdges }
}

/**
 * Resolve one call site to zero or more target edges, stopping at the first
 * non-empty resolution tier (see §2 of the design):
 *
 * 1. provably-owned local candidate (recursion / directly-owned declaration)
 * 2. explicit imported binding (incl. an honest default-binding path)
 * 3. qualifier matched to a namespace/package import
 * 4. names declared in resolved imported modules
 * 5. repo-wide name candidates
 */
export function resolveCallTargets(
  index: RepoIndex,
  file: IndexedFile,
  call: CallInfo,
  symbolsByName: Map<string, SymbolInfo[]>,
  maxCandidates = DEFAULT_MAX_CANDIDATES,
): ReferenceEdge[] {
  const fileSet = new Set(index.files.map((f) => f.path))
  const symbolsByFile = new Map(index.files.map((f) => [f.path, f.symbols]))
  return resolveCallTargetsFor(fileSet, file, call, symbolsByName, symbolsByFile, maxCandidates)
}

function resolveCallTargetsFor(
  fileSet: Set<string>,
  file: IndexedFile,
  call: CallInfo,
  symbolsByName: Map<string, SymbolInfo[]>,
  symbolsByFile: Map<string, SymbolInfo[]>,
  maxCandidates: number,
): ReferenceEdge[] {
  const named = symbolsByName.get(call.name) ?? []
  const qualified = call.qualifier !== null
  // Re-exports do not bind names in this module; only genuine imports can
  // target a call (§2 — re-export chains cannot claim exact).
  const imports = (file.importDetails ?? []).filter((info) => info.kind !== 'reexport')

  // Bare calls only: a qualified call names a member of its receiver, so a
  // same-named local or import binding must not capture it.
  if (!qualified) {
    // Tier 1 — a same-file symbol whose scope encloses this call site. `exact`
    // needs provable ownership: a parameter or local the index cannot see may
    // shadow any other name, including a module-level sibling.
    const locals = named.filter((s) => s.file === file.path && lexicallyVisible(s, call))
    if (locals.length > 0) {
      const unique = locals.length === 1
      const owned = unique && isStructuralOwner(call, locals[0]!)
      const provenance: ResolutionProvenance =
        owned && call.fromId !== null ? 'structural-owner' : 'local-unique'
      return toEdges(locals, call, file.path, provenance, owned ? 'exact' : 'name-only', maxCandidates)
    }

    // Tier 2 — explicit imported binding (`import { foo } from './x'`).
    const bound: SymbolInfo[] = []
    let directBinding = true
    let defaultBinding = false
    for (const info of imports) {
      for (const binding of info.bindings) {
        if (binding.local !== call.name) continue
        const isDefault = binding.kind === 'default' || binding.imported === 'default'
        if (!isDefault && !isExplicitBinding(binding)) continue
        const resolved = resolveImportDetailed(info.specifier, file.path, fileSet)
        const target = resolved.target
        if (!target) continue
        if (resolved.suffixSkipped) directBinding = false
        if (isDefault) {
          // `import x from './m'` binds a default export the index cannot name;
          // an alias match against the module's symbols is the only honest
          // target, else the module's exported set — and never `exact`.
          defaultBinding = true
          const moduleSymbols = symbolsByFile.get(target) ?? []
          const nameMatches = moduleSymbols.filter((s) => s.name === binding.local)
          bound.push(
            ...(nameMatches.length > 0 ? nameMatches : moduleSymbols.filter((s) => s.exported)),
          )
          continue
        }
        if (!isExplicitBinding(binding)) continue
        for (const def of symbolsByName.get(binding.imported) ?? []) {
          if (def.file === target) bound.push(def)
        }
      }
    }
    if (bound.length > 0) {
      const label: ResolutionLabel =
        bound.length === 1 && directBinding && !defaultBinding ? 'exact' : 'import-scoped'
      return toEdges(bound, call, file.path, 'explicit-import-binding', label, maxCandidates)
    }

    // Tier 4 — the name exists in a module this file imports, binding or not.
    const resolvedModules = new Set<string>()
    for (const info of imports) {
      const target = resolveImport(info.specifier, file.path, fileSet)
      if (target && target !== file.path) resolvedModules.add(target)
    }
    const imported = named.filter((s) => resolvedModules.has(s.file))
    if (imported.length > 0) {
      return toEdges(
        imported,
        call,
        file.path,
        'resolved-import-module',
        'import-scoped',
        maxCandidates,
      )
    }
  }

  // Tier 3 — `ns.foo()` where `ns` is a namespace/package import. A qualifier
  // must be an actual namespace/package binding; only a record that carries no
  // binding at all (e.g. a C/C++ include) may infer it from the path segment,
  // and even then it never elevates above `import-scoped`.
  if (qualified) {
    const qualifier = call.qualifier!
    const modules = new Set<string>()
    for (const info of imports) {
      const namespaceBound = info.bindings.some(
        (b) => (b.kind === 'namespace' || b.kind === 'package') && b.local === qualifier,
      )
      if (!namespaceBound) {
        if (info.bindings.length > 0) continue
        if (specifierLastSegment(info.specifier) !== qualifier) continue
      }
      const target = resolveImport(info.specifier, file.path, fileSet)
      if (target && target !== file.path) modules.add(target)
    }
    const qualifiedTargets = named.filter((s) => modules.has(s.file))
    if (qualifiedTargets.length > 0) {
      return toEdges(
        qualifiedTargets,
        call,
        file.path,
        'namespace-import',
        'import-scoped',
        maxCandidates,
      )
    }
  }

  // Tier 5 — repo-wide name match, no import evidence.
  if (named.length > 0) {
    return toEdges(named, call, file.path, 'global-name', 'name-only', maxCandidates)
  }
  return []
}

/** Materialize one edge per candidate, capped — `candidateCount` stays truthful. */
function toEdges(
  candidates: SymbolInfo[],
  call: CallInfo,
  filePath: string,
  provenance: ResolutionProvenance,
  resolution: ResolutionLabel,
  maxCandidates: number,
): ReferenceEdge[] {
  const unique = dedupeSymbols(candidates)
  const count = unique.length
  const cap = maxCandidates > 0 ? Math.floor(maxCandidates) : 0
  return unique.slice(0, cap).map((target) => ({
    sourceId: call.fromId,
    targetId: target.id,
    callSite: { file: filePath, line: call.line },
    name: call.name,
    provenance,
    resolution,
    candidateCount: count,
  }))
}

function appendEdges(
  map: Map<SymbolId, ReferenceEdge[]>,
  key: SymbolId,
  edges: ReferenceEdge[],
): void {
  const list = map.get(key)
  if (list) list.push(...edges)
  else map.set(key, [...edges])
}

function dedupeSymbols(candidates: SymbolInfo[]): SymbolInfo[] {
  const sorted = [...candidates].sort(compareSymbols)
  const out: SymbolInfo[] = []
  const seen = new Set<SymbolId>()
  for (const symbol of sorted) {
    if (seen.has(symbol.id)) continue
    seen.add(symbol.id)
    out.push(symbol)
  }
  return out
}

function compareSymbols(a: SymbolInfo, b: SymbolInfo): number {
  return (
    a.file.localeCompare(b.file) ||
    a.line - b.line ||
    a.kind.localeCompare(b.kind) ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id)
  )
}

/**
 * A candidate is lexically visible at the call when its *containing* scope is
 * an ancestor of the call's structural owner (or of the module, for a
 * module-level call). The symbol-id path encodes the scope chain, so this is a
 * prefix test rather than a re-parse.
 */
function lexicallyVisible(candidate: SymbolInfo, call: CallInfo): boolean {
  if (call.fromId) {
    const ownerPath = pathAfterHash(call.fromId)
    const scopePath = containerPath(candidate.id)
    if (scopePath === '') return true
    return ownerPath === scopePath || ownerPath.startsWith(`${scopePath}/`)
  }
  if (candidate.scope.length === 0) return true
  return candidate.line <= call.line && call.line <= candidate.endLine
}

/**
 * True when the target's containment structurally proves ownership: a
 * module-level target called from module scope (no callable can shadow it),
 * the call's own owner (recursion), or a declaration directly inside the
 * call's owner. A module-level symbol called from *inside* a callable is not
 * proof — an unseen parameter or local may shadow it.
 */
function isStructuralOwner(call: CallInfo, target: SymbolInfo): boolean {
  if (!call.fromId) return containerPath(target.id) === ''
  if (target.id === call.fromId) return true
  return containerPath(target.id) === pathAfterHash(call.fromId)
}

/** Scope-chain portion of a symbol id (the part between `#` and the last `/`). */
function pathAfterHash(id: SymbolId): string {
  const hash = id.indexOf('#')
  return hash >= 0 ? id.slice(hash + 1) : id
}

function containerPath(id: SymbolId): string {
  const full = pathAfterHash(id)
  const slash = full.lastIndexOf('/')
  return slash >= 0 ? full.slice(0, slash) : ''
}

/** A binding that names one concrete imported symbol (not a namespace/glob). */
function isExplicitBinding(
  binding: ImportBinding,
): binding is ImportBinding & { imported: string } {
  return binding.imported != null && binding.imported !== '*' && binding.imported !== 'default'
}

/** Last path-like segment of a specifier, extension stripped. */
function specifierLastSegment(specifier: string): string {
  const clean = specifier.split(/[?#]/)[0] ?? specifier
  const segment = clean.split('/').filter(Boolean).pop() ?? clean
  return segment.replace(/\.[A-Za-z0-9]+$/, '')
}
