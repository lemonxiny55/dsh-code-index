/** Function-level call graph built from the cached index — pure, no IO. */

import type { AliasVia } from './alias.js'
import { resolveImportDetailed, resolveImportTargets, type ImportResolutionVia } from './repomap.js'
import type {
  CallInfo,
  ImportBinding,
  ImportInfo,
  IndexedFile,
  RepoIndex,
  ResolutionConfig,
  SymbolId,
  SymbolInfo,
} from './types.js'

export const MAX_REEXPORT_DEPTH = 3

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
  via?: string
}

/** One distinct symbol the queried function calls, with its first call line. */
export interface CalleeHit {
  name: string
  line: number
  /** In-repo definitions matched by the callee name. */
  targets: SymbolInfo[]
  via?: string
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

/** Format deterministic resolution provenance notes without inventing numeric confidence. */
export function formatResolutionVia(
  via?: ImportResolutionVia | AliasVia,
  reexportDepth = 0,
): string | undefined {
  const aliasPart =
    via && via !== 'relative' && via !== 'suffix-fallback' ? via : undefined
  if (aliasPart && reexportDepth > 0) return `${aliasPart}+reexport(${reexportDepth})`
  if (aliasPart) return aliasPart
  if (reexportDepth > 0) return `reexport(${reexportDepth})`
  return undefined
}

/**
 * Resolve one symbol to its callers (call sites invoking it anywhere) and its
 * callees (calls made inside the definition, attributed by the extracted
 * enclosing-function name). Uses the provenance-labeled reference graph so
 * path aliases and bounded barrel re-export chains resolve accurately.
 */
export function symbolRefs(index: RepoIndex, symbol: string, limit = 200): SymbolRefs {
  const table = buildSymbolTable(index)
  const defs = table.get(symbol) ?? []
  const graph = buildReferenceGraph(index)

  const callers: CallerHit[] = []
  const calleeFirstLine = new Map<string, number>()
  const calleeTargets = new Map<string, SymbolInfo[]>()
  const calleeVia = new Map<string, string>()

  const edgesBySite = new Map<string, ReferenceEdge[]>()
  for (const edge of [...graph.outgoing.values()].flat().concat(graph.moduleLevelEdges)) {
    const key = `${edge.callSite.file}\u0000${edge.callSite.line}\u0000${edge.name}\u0000${edge.sourceId}`
    const rows = edgesBySite.get(key) ?? []
    rows.push(edge)
    edgesBySite.set(key, rows)
  }

  for (const file of index.files) {
    for (const call of file.calls ?? []) {
      const siteEdges =
        edgesBySite.get(`${file.path}\u0000${call.line}\u0000${call.name}\u0000${call.fromId}`) ?? []
      const resolved = siteEdges.map((edge) => graph.symbolsById.get(edge.targetId)!).filter(Boolean)
      const matchedCaller = resolved.some((target) => target.name === symbol)
      const fallbackNameMatch = defs.length === 0 && file.lang !== 'arkts' && call.name === symbol
      if (matchedCaller || fallbackNameMatch) {
        const edgeVia = siteEdges.find((edge) => edge.via)?.via
        callers.push({
          file: file.path,
          line: call.line,
          from: call.from,
          ...(edgeVia ? { via: edgeVia } : {}),
        })
      }
      if (call.from === symbol) {
        if (!calleeFirstLine.has(call.name)) {
          calleeFirstLine.set(call.name, call.line)
        }
        const targets = resolved.length > 0 ? resolved : (file.lang === 'arkts' ? [] : (table.get(call.name) ?? []))
        calleeTargets.set(
          call.name,
          dedupeSymbols([...(calleeTargets.get(call.name) ?? []), ...targets]),
        )
        const edgeVia = siteEdges.find((edge) => edge.via)?.via
        if (edgeVia && !calleeVia.has(call.name)) calleeVia.set(call.name, edgeVia)
      }
    }
  }

  callers.sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.from.localeCompare(b.from),
  )

  const callees: CalleeHit[] = [...calleeFirstLine.entries()]
    .map(([name, line]) => {
      const via = calleeVia.get(name)
      return {
        name,
        line,
        targets: calleeTargets.get(name) ?? (table.get(name) ?? []),
        ...(via ? { via } : {}),
      }
    })
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

/** Record of a wildcard/alias specifier matching multiple indexed files. */
export interface AmbiguousAliasHit {
  file: string
  specifier: string
  candidates: string[]
  via?: AliasVia
}

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
  /** Deterministic path-alias / re-export chain explanation, when applicable. */
  via?: string
  /** True when any hop on this resolution hit an ambiguous wildcard alias. */
  ambiguousAlias?: boolean
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
  /** Ambiguous alias/wildcard resolutions observed while building the graph. */
  ambiguousAliases: AmbiguousAliasHit[]
}

export interface ReferenceGraphOptions {
  /** Max candidate targets emitted per call site (default 8). */
  maxCandidatesPerCall?: number
}

const DEFAULT_MAX_CANDIDATES = 8

/**
 * Build the provenance-labeled reference graph for an index. Pure: reads the
 * cached index only.
 */
export function buildReferenceGraph(
  index: RepoIndex,
  options: ReferenceGraphOptions = {},
): ReferenceGraph {
  const maxCandidates = options.maxCandidatesPerCall ?? DEFAULT_MAX_CANDIDATES
  const symbolsById = new Map<SymbolId, SymbolInfo>()
  const symbolsByFile = new Map<string, SymbolInfo[]>()
  const filesByPath = new Map<string, IndexedFile>()
  for (const file of index.files) {
    filesByPath.set(file.path, file)
    for (const symbol of file.symbols) symbolsById.set(symbol.id, symbol)
    symbolsByFile.set(file.path, file.symbols)
  }
  const symbolsByName = buildSymbolTable(index)
  const fileSet = new Set(index.files.map((file) => file.path))

  const outgoing = new Map<SymbolId, ReferenceEdge[]>()
  const incoming = new Map<SymbolId, ReferenceEdge[]>()
  const moduleLevelEdges: ReferenceEdge[] = []
  const ambiguousMap = new Map<string, AmbiguousAliasHit>()

  const recordAmbiguous = (hit: AmbiguousAliasHit): void => {
    const key = `${hit.file}\u0000${hit.specifier}`
    if (!ambiguousMap.has(key)) ambiguousMap.set(key, hit)
  }

  for (const file of index.files) {
    for (const call of file.calls ?? []) {
      const edges = resolveCallTargetsFor(
        fileSet,
        filesByPath,
        file,
        call,
        symbolsByName,
        symbolsByFile,
        index.resolution,
        maxCandidates,
        recordAmbiguous,
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

  const ambiguousAliases = [...ambiguousMap.values()].sort(
    (a, b) => a.file.localeCompare(b.file) || a.specifier.localeCompare(b.specifier),
  )

  return { symbolsById, outgoing, incoming, moduleLevelEdges, ambiguousAliases }
}

/**
 * Resolve one call site to zero or more target edges, stopping at the first
 * non-empty resolution tier.
 */
export function resolveCallTargets(
  index: RepoIndex,
  file: IndexedFile,
  call: CallInfo,
  symbolsByName: Map<string, SymbolInfo[]>,
  maxCandidates = DEFAULT_MAX_CANDIDATES,
): ReferenceEdge[] {
  const fileSet = new Set(index.files.map((f) => f.path))
  const filesByPath = new Map(index.files.map((f) => [f.path, f]))
  const symbolsByFile = new Map(index.files.map((f) => [f.path, f.symbols]))
  return resolveCallTargetsFor(
    fileSet,
    filesByPath,
    file,
    call,
    symbolsByName,
    symbolsByFile,
    index.resolution,
    maxCandidates,
  )
}

interface ExportedMatch {
  symbol: SymbolInfo
  reexportDepth: number
  exactEligible: boolean
  ambiguousAlias: boolean
  aliasVia?: AliasVia
}

function isWildcardReexport(info: ImportInfo): boolean {
  return (
    info.kind === 'reexport' &&
    (info.bindings.length === 0 || info.bindings.some((b) => b.kind === 'glob'))
  )
}

function isExportedCandidate(def: SymbolInfo, fromFile: IndexedFile, targetPath: string): boolean {
  if (fromFile.lang !== 'arkts' && !targetPath.endsWith('.ets')) return true
  return def.exported && def.scope.length === 0
}

/**
 * Follow barrel re-exports (`export { ... } from` and `export * from`) up to
 * `MAX_REEXPORT_DEPTH = 3`, using `visited` to prevent infinite loops on cycles.
 */
function resolveExportedSymbols(
  modulePath: string,
  wantedName: string,
  isDefault: boolean,
  fromFile: IndexedFile,
  fileSet: Set<string>,
  filesByPath: Map<string, IndexedFile>,
  symbolsByName: Map<string, SymbolInfo[]>,
  symbolsByFile: Map<string, SymbolInfo[]>,
  resolution: ResolutionConfig | undefined,
  depth: number,
  visited: Set<string>,
  inheritedAliasVia: AliasVia | undefined,
  inheritedAmbiguous: boolean,
  onAmbiguous?: (hit: AmbiguousAliasHit) => void,
): ExportedMatch[] {
  const visitKey = `${modulePath}\u0000${isDefault ? '<default>' : wantedName}`
  if (visited.has(visitKey)) return []
  visited.add(visitKey)

  try {
    // Direct definitions in `modulePath`
    const directMatches: ExportedMatch[] = []
    if (isDefault) {
      const moduleSymbols = symbolsByFile.get(modulePath) ?? []
      const nameMatches = moduleSymbols.filter(
        (s) => s.name === wantedName && isExportedCandidate(s, fromFile, modulePath),
      )
      for (const symbol of nameMatches) {
        directMatches.push({
          symbol,
          reexportDepth: depth,
          exactEligible: false,
          ambiguousAlias: inheritedAmbiguous,
          aliasVia: inheritedAliasVia,
        })
      }
      if (directMatches.length > 0) return directMatches
    } else {
      for (const def of symbolsByName.get(wantedName) ?? []) {
        if (def.file === modulePath && isExportedCandidate(def, fromFile, modulePath)) {
          directMatches.push({
            symbol: def,
            reexportDepth: depth,
            exactEligible: !inheritedAmbiguous,
            ambiguousAlias: inheritedAmbiguous,
            aliasVia: inheritedAliasVia,
          })
        }
      }
      if (directMatches.length > 0) return directMatches
    }

    // Stop traversing once hard re-export depth cap is reached.
    if (depth >= MAX_REEXPORT_DEPTH) {
      if (isDefault) {
        const moduleSymbols = symbolsByFile.get(modulePath) ?? []
        return moduleSymbols.filter((s) => s.exported).map((symbol) => ({
          symbol,
          reexportDepth: depth,
          exactEligible: false,
          ambiguousAlias: inheritedAmbiguous,
          aliasVia: inheritedAliasVia,
        }))
      }
      return []
    }

    const moduleFile = filesByPath.get(modulePath)
    if (!moduleFile) return []
    const reexports = (moduleFile.importDetails ?? []).filter((info) => info.kind === 'reexport')
    if (reexports.length === 0) {
      if (isDefault) {
        const moduleSymbols = symbolsByFile.get(modulePath) ?? []
        return moduleSymbols.filter((s) => s.exported).map((symbol) => ({
          symbol,
          reexportDepth: depth,
          exactEligible: false,
          ambiguousAlias: inheritedAmbiguous,
          aliasVia: inheritedAliasVia,
        }))
      }
      return []
    }

    const targetName = isDefault ? 'default' : wantedName
    const namedHits: ExportedMatch[] = []

    // Named re-exports: `export { a as b } from ...`, `export { default as Foo } from ...`, `export { x as default } from ...`
    for (const re of reexports) {
      if (isWildcardReexport(re)) continue
      for (const binding of re.bindings) {
        if (binding.local !== targetName) continue
        if (!binding.imported || binding.imported === '*') continue
        const nextIsDefault = binding.imported === 'default'
        const nextWanted = nextIsDefault ? wantedName : binding.imported

        const resolved = resolveImportDetailed(re.specifier, modulePath, fileSet, resolution)
        const targets = resolved.targets ?? (resolved.target ? [resolved.target] : [])
        if (targets.length === 0) continue

        if (resolved.ambiguous) {
          onAmbiguous?.({
            file: modulePath,
            specifier: re.specifier,
            candidates: targets,
            via: toAliasVia(resolved.via),
          })
        }

        const hopAlias = inheritedAliasVia ?? toAliasVia(resolved.via)
        const hopAmbiguous = inheritedAmbiguous || Boolean(resolved.ambiguous)
        const hopExactOk = !resolved.suffixSkipped && !resolved.ambiguous && !nextIsDefault

        for (const nextModule of targets) {
          const nested = resolveExportedSymbols(
            nextModule,
            nextWanted,
            nextIsDefault,
            fromFile,
            fileSet,
            filesByPath,
            symbolsByName,
            symbolsByFile,
            resolution,
            depth + 1,
            visited,
            hopAlias,
            hopAmbiguous,
            onAmbiguous,
          )
          for (const hit of nested) {
            namedHits.push({
              ...hit,
              exactEligible: hit.exactEligible && hopExactOk,
            })
          }
        }
      }
    }
    if (namedHits.length > 0) return namedHits

    // Wildcard re-exports (`export * from ...`): never forward `default` and never claim `exact`.
    if (isDefault) {
      const moduleSymbols = symbolsByFile.get(modulePath) ?? []
      return moduleSymbols.filter((s) => s.exported).map((symbol) => ({
        symbol,
        reexportDepth: depth,
        exactEligible: false,
        ambiguousAlias: inheritedAmbiguous,
        aliasVia: inheritedAliasVia,
      }))
    }
    const wildcardHits: ExportedMatch[] = []
    for (const re of reexports) {
      if (!isWildcardReexport(re)) continue
      const resolved = resolveImportDetailed(re.specifier, modulePath, fileSet, resolution)
      const targets = resolved.targets ?? (resolved.target ? [resolved.target] : [])
      if (targets.length === 0) continue
      if (resolved.ambiguous) {
        onAmbiguous?.({
          file: modulePath,
          specifier: re.specifier,
          candidates: targets,
          via: toAliasVia(resolved.via),
        })
      }
      const hopAlias = inheritedAliasVia ?? toAliasVia(resolved.via)
      const hopAmbiguous = inheritedAmbiguous || Boolean(resolved.ambiguous)
      for (const nextModule of targets) {
        const nested = resolveExportedSymbols(
          nextModule,
          wantedName,
          false,
          fromFile,
          fileSet,
          filesByPath,
          symbolsByName,
          symbolsByFile,
          resolution,
          depth + 1,
          visited,
          hopAlias,
          hopAmbiguous,
          onAmbiguous,
        )
        for (const hit of nested) {
          wildcardHits.push({
            ...hit,
            exactEligible: false, // wildcard barrel traversal always stays import-scoped
          })
        }
      }
    }
    return wildcardHits
  } finally {
    visited.delete(visitKey)
  }
}

function toAliasVia(via: ImportResolutionVia | undefined): AliasVia | undefined {
  return via && via !== 'relative' && via !== 'suffix-fallback' ? via : undefined
}

function resolveReexportModuleClosure(
  startModules: readonly string[],
  fileSet: Set<string>,
  filesByPath: Map<string, IndexedFile>,
  resolution: ResolutionConfig | undefined,
  initialAliasVia: AliasVia | undefined,
  initialAmbiguous: boolean,
  onAmbiguous?: (hit: AmbiguousAliasHit) => void,
): Map<string, { depth: number; aliasVia?: AliasVia; ambiguousAlias: boolean }> {
  const visited = new Map<string, { depth: number; aliasVia?: AliasVia; ambiguousAlias: boolean }>()
  const queue: Array<{ path: string; depth: number; aliasVia?: AliasVia; ambiguousAlias: boolean }> =
    startModules.map((p) => ({
      path: p,
      depth: 0,
      aliasVia: initialAliasVia,
      ambiguousAlias: initialAmbiguous,
    }))

  while (queue.length > 0) {
    const current = queue.shift()!
    const prev = visited.get(current.path)
    if (prev && prev.depth <= current.depth) continue
    visited.set(current.path, {
      depth: current.depth,
      aliasVia: current.aliasVia,
      ambiguousAlias: current.ambiguousAlias,
    })
    if (current.depth >= MAX_REEXPORT_DEPTH) continue

    const file = filesByPath.get(current.path)
    if (!file) continue
    for (const re of file.importDetails ?? []) {
      if (re.kind !== 'reexport') continue
      const resolved = resolveImportDetailed(re.specifier, current.path, fileSet, resolution)
      const targets = resolved.targets ?? (resolved.target ? [resolved.target] : [])
      if (targets.length === 0) continue
      if (resolved.ambiguous) {
        onAmbiguous?.({
          file: current.path,
          specifier: re.specifier,
          candidates: targets,
          via: toAliasVia(resolved.via),
        })
      }
      const nextAlias = current.aliasVia ?? toAliasVia(resolved.via)
      const nextAmbiguous = current.ambiguousAlias || Boolean(resolved.ambiguous)
      for (const nextPath of targets) {
        queue.push({
          path: nextPath,
          depth: current.depth + 1,
          aliasVia: nextAlias,
          ambiguousAlias: nextAmbiguous,
        })
      }
    }
  }
  return visited
}

function resolveCallTargetsFor(
  fileSet: Set<string>,
  filesByPath: Map<string, IndexedFile>,
  file: IndexedFile,
  call: CallInfo,
  symbolsByName: Map<string, SymbolInfo[]>,
  symbolsByFile: Map<string, SymbolInfo[]>,
  resolution: ResolutionConfig | undefined,
  maxCandidates: number,
  onAmbiguous?: (hit: AmbiguousAliasHit) => void,
): ReferenceEdge[] {
  const named = symbolsByName.get(call.name) ?? []
  const qualified = call.qualifier !== null
  // Re-exports do not bind names in this module; only genuine imports can
  // target a call (§2 — finding #6).
  const imports = (file.importDetails ?? []).filter((info) => info.kind !== 'reexport')

  // Bare calls only: a qualified call names a member of its receiver, so a
  // same-named local or import binding must not capture it.
  if (!qualified) {
    // Tier 1 — same-file enclosing/local candidate.
    const locals = named.filter(
      (s) =>
        s.file === file.path &&
        lexicallyVisible(s, call) &&
        (call.context !== 'arkui' ||
          s.signature.startsWith('struct ') ||
          s.decorators?.some((text) => /^@Builder\b/.test(text))),
    )
    if (locals.length > 0) {
      const unique = locals.length === 1
      const owned = unique && isStructuralOwner(call, locals[0]!)
      const provenance: ResolutionProvenance =
        owned && call.fromId !== null ? 'structural-owner' : 'local-unique'
      return toEdges(
        locals,
        call,
        file.path,
        provenance,
        owned ? 'exact' : 'name-only',
        maxCandidates,
      )
    }

    // Tier 2 — explicit imported binding (`import { foo } from './x'` or `@/barrel`).
    const boundMatches: ExportedMatch[] = []
    let directBinding = true
    let defaultBinding = false
    for (const info of imports) {
      for (const binding of info.bindings) {
        if (binding.local !== call.name) continue
        const isDefault = binding.kind === 'default' || binding.imported === 'default'
        if (!isDefault && !isExplicitBinding(binding)) continue

        const resolved = resolveImportDetailed(info.specifier, file.path, fileSet, resolution)
        const targets = resolved.targets ?? (resolved.target ? [resolved.target] : [])
        if (targets.length === 0) continue

        if (resolved.suffixSkipped) directBinding = false
        if (resolved.ambiguous) {
          directBinding = false
          onAmbiguous?.({
            file: file.path,
            specifier: info.specifier,
            candidates: targets,
            via: toAliasVia(resolved.via),
          })
        }
        if (isDefault) defaultBinding = true

        const aliasVia = toAliasVia(resolved.via)
        const wantedName = isDefault ? binding.local : binding.imported!

        for (const target of targets) {
          const hits = resolveExportedSymbols(
            target,
            wantedName,
            isDefault,
            file,
            fileSet,
            filesByPath,
            symbolsByName,
            symbolsByFile,
            resolution,
            0,
            new Set(),
            aliasVia,
            Boolean(resolved.ambiguous),
            onAmbiguous,
          )
          boundMatches.push(...hits)
        }
      }
    }
    if (boundMatches.length > 0) {
      const uniqueSymbols = dedupeSymbols(boundMatches.map((m) => m.symbol))
      const bestById = new Map<SymbolId, ExportedMatch>()
      for (const match of boundMatches) {
        const prev = bestById.get(match.symbol.id)
        if (
          !prev ||
          (match.exactEligible && !prev.exactEligible) ||
          match.reexportDepth < prev.reexportDepth
        ) {
          bestById.set(match.symbol.id, match)
        }
      }
      const allExactEligible = boundMatches.every((m) => m.exactEligible && !m.ambiguousAlias)
      const anyAmbiguous = boundMatches.some((m) => m.ambiguousAlias)
      const label: ResolutionLabel =
        uniqueSymbols.length === 1 &&
        directBinding &&
        !defaultBinding &&
        allExactEligible &&
        !anyAmbiguous
          ? 'exact'
          : 'import-scoped'

      const viaById = new Map<SymbolId, { via?: string; ambiguousAlias?: boolean }>()
      for (const [id, match] of bestById) {
        const via = formatResolutionVia(match.aliasVia, match.reexportDepth)
        viaById.set(id, {
          ...(via ? { via } : {}),
          ...(match.ambiguousAlias ? { ambiguousAlias: true } : {}),
        })
      }
      return toEdgesWithMeta(
        uniqueSymbols,
        call,
        file.path,
        'explicit-import-binding',
        label,
        maxCandidates,
        viaById,
      )
    }

    // Built-ins must not acquire same-named definitions through a module
    // import or a repo-wide lookup when there is no local/explicit binding.
    if (call.context === 'arkui') return []

    // Tier 4 — the name exists in a module this file imports (or its barrel chain).
    const moduleEntries = new Map<
      string,
      { depth: number; aliasVia?: AliasVia; ambiguousAlias: boolean }
    >()
    for (const info of imports) {
      const resolved = resolveImportDetailed(info.specifier, file.path, fileSet, resolution)
      const targets = resolved.targets ?? (resolved.target ? [resolved.target] : [])
      if (targets.length === 0) continue
      if (resolved.ambiguous) {
        onAmbiguous?.({
          file: file.path,
          specifier: info.specifier,
          candidates: targets,
          via: toAliasVia(resolved.via),
        })
      }
      const closure = resolveReexportModuleClosure(
        targets,
        fileSet,
        filesByPath,
        resolution,
        toAliasVia(resolved.via),
        Boolean(resolved.ambiguous),
        onAmbiguous,
      )
      for (const [modPath, meta] of closure) {
        if (modPath === file.path) continue
        const prev = moduleEntries.get(modPath)
        if (!prev || meta.depth < prev.depth) moduleEntries.set(modPath, meta)
      }
    }
    const imported = named.filter((s) => moduleEntries.has(s.file))
    if (imported.length > 0) {
      const viaById = new Map<SymbolId, { via?: string; ambiguousAlias?: boolean }>()
      for (const sym of imported) {
        const meta = moduleEntries.get(sym.file)!
        const via = formatResolutionVia(meta.aliasVia, meta.depth)
        viaById.set(sym.id, {
          ...(via ? { via } : {}),
          ...(meta.ambiguousAlias ? { ambiguousAlias: true } : {}),
        })
      }
      return toEdgesWithMeta(
        imported,
        call,
        file.path,
        'resolved-import-module',
        'import-scoped',
        maxCandidates,
        viaById,
      )
    }
  }

  // Tier 3 — `ns.foo()` where `ns` is a namespace/package import.
  if (qualified) {
    const qualifier = call.qualifier!
    const matchedModules = new Map<
      string,
      { depth: number; aliasVia?: AliasVia; ambiguousAlias: boolean }
    >()
    for (const info of imports) {
      const namespaceBound = info.bindings.some(
        (b) => (b.kind === 'namespace' || b.kind === 'package') && b.local === qualifier,
      )
      const reexportNamespaceBound =
        !namespaceBound && info.bindings.some((b) => b.kind === 'named' && b.local === qualifier)
      if (!namespaceBound && !reexportNamespaceBound) {
        if (info.bindings.length > 0) continue
        if (specifierLastSegment(info.specifier) !== qualifier) continue
      }

      const resolved = resolveImportDetailed(info.specifier, file.path, fileSet, resolution)
      const targets = resolved.targets ?? (resolved.target ? [resolved.target] : [])
      if (targets.length === 0) continue
      if (resolved.ambiguous) {
        onAmbiguous?.({
          file: file.path,
          specifier: info.specifier,
          candidates: targets,
          via: toAliasVia(resolved.via),
        })
      }

      const initialAlias = toAliasVia(resolved.via)
      const initialAmbiguous = Boolean(resolved.ambiguous)

      if (reexportNamespaceBound) {
        const namedBinding = info.bindings.find(
          (b) => b.kind === 'named' && b.local === qualifier,
        )!
        const startTargets: string[] = []
        let depthBump = 0
        for (const barrelPath of targets) {
          const barrelFile = filesByPath.get(barrelPath)
          for (const re of barrelFile?.importDetails ?? []) {
            if (re.kind !== 'reexport') continue
            const nsRe = re.bindings.find(
              (b) => b.kind === 'namespace' && b.local === namedBinding.imported,
            )
            if (!nsRe) continue
            for (const next of resolveImportTargets(re.specifier, barrelPath, fileSet, resolution)) {
              startTargets.push(next)
              depthBump = 1
            }
          }
        }
        if (startTargets.length === 0) continue
        const closure = resolveReexportModuleClosure(
          startTargets,
          fileSet,
          filesByPath,
          resolution,
          initialAlias,
          initialAmbiguous,
          onAmbiguous,
        )
        for (const [modPath, meta] of closure) {
          if (modPath === file.path) continue
          const prev = matchedModules.get(modPath)
          const totalDepth = Math.min(MAX_REEXPORT_DEPTH, meta.depth + depthBump)
          if (!prev || totalDepth < prev.depth) {
            matchedModules.set(modPath, { ...meta, depth: totalDepth })
          }
        }
        continue
      }

      const closure = resolveReexportModuleClosure(
        targets,
        fileSet,
        filesByPath,
        resolution,
        initialAlias,
        initialAmbiguous,
        onAmbiguous,
      )
      for (const [modPath, meta] of closure) {
        if (modPath === file.path) continue
        const prev = matchedModules.get(modPath)
        if (!prev || meta.depth < prev.depth) matchedModules.set(modPath, meta)
      }
    }

    const qualifiedTargets = named.filter((s) => matchedModules.has(s.file))
    if (qualifiedTargets.length > 0) {
      const viaById = new Map<SymbolId, { via?: string; ambiguousAlias?: boolean }>()
      for (const sym of qualifiedTargets) {
        const meta = matchedModules.get(sym.file)!
        const via = formatResolutionVia(meta.aliasVia, meta.depth)
        viaById.set(sym.id, {
          ...(via ? { via } : {}),
          ...(meta.ambiguousAlias ? { ambiguousAlias: true } : {}),
        })
      }
      return toEdgesWithMeta(
        qualifiedTargets,
        call,
        file.path,
        'namespace-import',
        'import-scoped',
        maxCandidates,
        viaById,
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
  return toEdgesWithMeta(candidates, call, filePath, provenance, resolution, maxCandidates)
}

function toEdgesWithMeta(
  candidates: SymbolInfo[],
  call: CallInfo,
  filePath: string,
  provenance: ResolutionProvenance,
  resolution: ResolutionLabel,
  maxCandidates: number,
  metaById?: Map<SymbolId, { via?: string; ambiguousAlias?: boolean }>,
): ReferenceEdge[] {
  const unique = dedupeSymbols(candidates)
  const count = unique.length
  const cap = maxCandidates > 0 ? Math.floor(maxCandidates) : 0
  return unique.slice(0, cap).map((target) => {
    const meta = metaById?.get(target.id)
    return {
      sourceId: call.fromId,
      targetId: target.id,
      callSite: { file: filePath, line: call.line },
      name: call.name,
      provenance,
      resolution,
      candidateCount: count,
      ...(meta?.via ? { via: meta.via } : {}),
      ...(meta?.ambiguousAlias ? { ambiguousAlias: true } : {}),
    }
  })
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
