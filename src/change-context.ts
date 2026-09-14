/**
 * Change-aware context (design §3): map a git/working-tree diff (or an explicit
 * file/symbol selection) onto indexed symbols, then walk the provenance-labeled
 * reference graph to surface callers, import dependents, transitive impact,
 * entry-point paths, and likely affected tests.
 *
 * Every relation keeps the reference graph's honest label (`exact` /
 * `import-scoped` / `name-only`); a diff hunk intersecting a symbol's declared
 * line range is the only thing treated as `exact`.
 */

import path from 'node:path'
import { buildReferenceGraph, type ResolutionLabel, type ResolutionProvenance } from './refgraph.js'
import { buildModuleGraph } from './health.js'
import { resolveImport } from './repomap.js'
import { extractAll, languageForFile } from './extract.js'
import {
  parseUnifiedDiff,
  readGitFileAtRef,
  readWorkingTreeDiff,
  type FileChange,
} from './git-diff.js'
import type { IndexedFile, RepoIndex, SymbolId, SymbolInfo, SymbolKind } from './types.js'

/* -------------------------------------------------------------------------- */
/* Types (design §3)                                                          */
/* -------------------------------------------------------------------------- */

export type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed'

export interface ChangedSymbol {
  symbol: SymbolInfo
  change: ChangeKind
  side: 'current' | 'base'
  /** A hunk range intersecting the declaration is structural, not inferred. */
  resolution: 'exact'
}

export interface UnmappedChange {
  file: string
  side: 'current' | 'base'
  ranges: Array<{ startLine: number; endLine: number }>
  reason: 'outside-symbol' | 'base-content-unavailable'
}

export interface ImpactHop {
  fromId: SymbolId | null
  toId: SymbolId
  callSite: { file: string; line: number }
  resolution: ResolutionLabel
  reason: ResolutionProvenance
}

export interface ImpactRow {
  symbol: SymbolInfo
  depth: number
  via: ImpactHop
  resolution: ResolutionLabel
}

export interface SymbolPath {
  entry: SymbolInfo
  changed: SymbolInfo
  hops: ImpactHop[]
  resolution: ResolutionLabel
}

export interface ImportDependent {
  file: string
  changedFile: string
  specifier: string
  resolution: 'import-scoped'
}

export interface AffectedTest {
  file: string
  resolution: ResolutionLabel
  reason:
    | 'changed-test'
    | 'imports-changed-file'
    | 'imports-impact-file'
    | 'references-symbol-name'
    | 'path-convention'
  distance?: number
}

export interface ChangeContextResult {
  root: string
  source: 'git' | 'diff' | 'files' | 'symbols'
  baseRef?: string
  changed: ChangedSymbol[]
  unmapped: UnmappedChange[]
  directCallers: ImpactRow[]
  importDependents: ImportDependent[]
  paths: SymbolPath[]
  impact: ImpactRow[]
  tests: AffectedTest[]
  warnings: string[]
  truncated: {
    callers: boolean
    dependents: boolean
    paths: boolean
    impact: boolean
    tests: boolean
  }
}

export interface CodeChangeContextArgs {
  repoRoot?: string
  diff?: string
  baseRef?: string
  files?: string[]
  symbols?: SymbolId[]
  maxDepth?: number
  maxImpact?: number
  maxPaths?: number
  maxTests?: number
}

export interface ChangeContextOptions {
  maxDepth?: number
  maxImpact?: number
  maxPaths?: number
  maxTests?: number
}

/** Normalized input: exactly one selection mode. */
export type ChangeContextInput =
  | { kind: 'git'; root: string; baseRef: string }
  | { kind: 'diff'; root: string; text: string; baseRef?: string }
  | { kind: 'files'; files: string[] }
  | { kind: 'symbols'; symbolIds: SymbolId[] }

const LABEL_STRENGTH: Record<ResolutionLabel, number> = {
  exact: 3,
  'import-scoped': 2,
  'name-only': 1,
}

const ENTRY_KINDS = new Set<SymbolKind>(['function', 'method', 'class'])
const ENTRY_FILE_RE = /(^|\/)(main|index|cli|server|app)\.[^./]+$/
const TEST_RE =
  /(^|\/)(tests?|__tests__)(\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$|(^|\/)(?:test_[^/]+\.py|[^/]+_test\.(?:py|go))$/

/** Validate flat tool args and normalize them into one input mode. */
export function changeContextInputFromArgs(
  args: Pick<CodeChangeContextArgs, 'diff' | 'baseRef' | 'files' | 'symbols'>,
  root: string,
): ChangeContextInput {
  const hasDiff = typeof args.diff === 'string' && args.diff.trim().length > 0
  const hasFiles = Array.isArray(args.files) && args.files.length > 0
  const hasSymbols = Array.isArray(args.symbols) && args.symbols.length > 0
  if ([hasDiff, hasFiles, hasSymbols].filter(Boolean).length > 1) {
    throw new Error('pass only one of diff, files, symbols')
  }
  const suppliedBaseRef =
    typeof args.baseRef === 'string' && args.baseRef.length > 0 ? args.baseRef : undefined
  if (hasDiff) {
    return suppliedBaseRef === undefined
      ? { kind: 'diff', root, text: args.diff! }
      : { kind: 'diff', root, text: args.diff!, baseRef: suppliedBaseRef }
  }
  if (hasFiles) return { kind: 'files', files: args.files!.map(requireSafePath) }
  if (hasSymbols) return { kind: 'symbols', symbolIds: [...args.symbols!] }
  return { kind: 'git', root, baseRef: suppliedBaseRef ?? 'HEAD' }
}

function requireSafePath(raw: string): string {
  const value = raw.replace(/\\/g, '/').trim()
  if (value.length === 0) throw new Error('file path must not be empty')
  if (value.startsWith('/') || /^[A-Za-z]:\//.test(value)) {
    throw new Error(`absolute file path not allowed: ${raw}`)
  }
  if (/(^|\/)\.\.(\/|$)/.test(value)) throw new Error(`path must stay inside the repo: ${raw}`)
  return value.replace(/^\.\//, '')
}

function clamp(value: number | undefined, lo: number, hi: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(hi, Math.max(lo, Math.floor(value)))
}

function weakest(labels: readonly ResolutionLabel[]): ResolutionLabel {
  let out: ResolutionLabel = 'exact'
  for (const label of labels) {
    if (LABEL_STRENGTH[label] < LABEL_STRENGTH[out]) out = label
  }
  return out
}

function symbolLabel(symbol: SymbolInfo): string {
  return `${symbol.kind} ${symbol.signature || symbol.name}`
}

/* -------------------------------------------------------------------------- */
/* Pipeline                                                                   */
/* -------------------------------------------------------------------------- */

export async function buildChangeContext(
  index: RepoIndex,
  input: ChangeContextInput,
  options: ChangeContextOptions = {},
): Promise<ChangeContextResult> {
  const maxDepth = clamp(options.maxDepth, 1, 6, 3)
  const maxImpact = clamp(options.maxImpact, 1, 200, 40)
  const maxPaths = clamp(options.maxPaths, 1, 50, 10)
  const maxTests = clamp(options.maxTests, 1, 100, 20)

  const graph = buildReferenceGraph(index)
  const moduleGraph = buildModuleGraph(index)
  const filesByPath = new Map(index.files.map((file) => [file.path, file]))
  const fileSet = new Set(filesByPath.keys())
  const incomingCount = new Map<SymbolId, number>()
  for (const [id, edges] of graph.incoming) incomingCount.set(id, edges.length)

  const warnings: string[] = []
  const changedByKey = new Map<string, ChangedSymbol>()
  const unmapped: UnmappedChange[] = []
  const changedFiles = new Set<string>()

  const commandRoot = input.kind === 'git' || input.kind === 'diff' ? input.root : index.root
  if (path.resolve(commandRoot) !== path.resolve(index.root)) {
    warnings.push(
      `command root ${path.resolve(commandRoot)} differs from indexed root ${index.root}; using the cached index`,
    )
  }

  const addChanged = (
    symbol: SymbolInfo,
    change: ChangeKind,
    side: ChangedSymbol['side'],
  ): void => {
    const key = `${side}:${symbol.id}`
    if (!changedByKey.has(key)) changedByKey.set(key, { symbol, change, side, resolution: 'exact' })
  }

  const addUnmapped = (
    file: string,
    side: UnmappedChange['side'],
    ranges: Array<{ startLine: number; endLine: number }>,
    reason: UnmappedChange['reason'],
  ): void => {
    if (ranges.length > 0) unmapped.push({ file, side, ranges, reason })
  }

  let baseRef: string | undefined

  if (input.kind === 'files') {
    for (const filePath of input.files) {
      const file = filesByPath.get(filePath)
      if (!file) {
        warnings.push(`file not in index: ${filePath}`)
        continue
      }
      changedFiles.add(file.path)
      for (const symbol of file.symbols) addChanged(symbol, 'modified', 'current')
      if (file.symbols.length === 0) warnings.push(`no indexed symbols in changed file: ${filePath}`)
    }
  } else if (input.kind === 'symbols') {
    for (const id of input.symbolIds) {
      const symbol = graph.symbolsById.get(id)
      if (!symbol) {
        warnings.push(`symbol not in index: ${id}`)
        continue
      }
      changedFiles.add(symbol.file)
      addChanged(symbol, 'modified', 'current')
    }
  } else {
    let text: string
    if (input.kind === 'git') {
      baseRef = input.baseRef
      text = await readWorkingTreeDiff(input.root, input.baseRef)
      warnings.push(
        'git diff excludes untracked files; stage them or pass an explicit diff to include them',
      )
    } else {
      text = input.text
      baseRef = input.baseRef
    }

    const changes = parseUnifiedDiff(text).map((change) => ({
      ...change,
      oldPath: change.oldPath === null ? null : requireSafePath(change.oldPath),
      newPath: change.newPath === null ? null : requireSafePath(change.newPath),
    }))
    if (changes.length === 0) warnings.push('no changes found in the diff')

    const baseSymbolsCache = new Map<string, Promise<SymbolInfo[] | null>>()
    const readBaseSymbols = (filePath: string): Promise<SymbolInfo[] | null> => {
      const cached = baseSymbolsCache.get(filePath)
      if (cached) return cached
      const pending = (async (): Promise<SymbolInfo[] | null> => {
        if (baseRef === undefined) return null
        const content = await readGitFileAtRef(commandRoot, baseRef, filePath)
        if (content === null) return null
        const lang = languageForFile(filePath)
        if (!lang) return null
        const extracted = await extractAll(content, lang, filePath)
        return extracted.symbols
      })()
      baseSymbolsCache.set(filePath, pending)
      return pending
    }

    const symbolsByPath = new Map(index.files.map((file) => [file.path, file.symbols]))
    await mapDiffChanges(
      changes,
      symbolsByPath,
      addChanged,
      addUnmapped,
      changedFiles,
      readBaseSymbols,
      warnings,
    )
  }

  const changedSymbols = [...changedByKey.values()].sort(compareChanged)

  // Direct callers: incoming edges of each changed symbol.
  const callerById = new Map<SymbolId, ImpactRow>()
  for (const changed of changedSymbols) {
    for (const edge of graph.incoming.get(changed.symbol.id) ?? []) {
      if (edge.sourceId === null) continue
      const caller = graph.symbolsById.get(edge.sourceId)
      if (!caller) continue
      const row: ImpactRow = {
        symbol: caller,
        depth: 1,
        via: hopOf(edge),
        resolution: edge.resolution,
      }
      const existing = callerById.get(caller.id)
      if (!existing || LABEL_STRENGTH[row.resolution] > LABEL_STRENGTH[existing.resolution]) {
        callerById.set(caller.id, row)
      }
    }
  }
  const allCallers = [...callerById.values()].sort(compareBySymbol)

  // Transitive impact (depth >= 2), bounded by maxDepth.
  const changedIds = new Set(changedSymbols.map((changed) => changed.symbol.id))
  const impactById = new Map<SymbolId, ImpactRow>()
  {
    const depthById = new Map<SymbolId, number>()
    const strengthById = new Map<SymbolId, ResolutionLabel>()
    for (const id of changedIds) {
      depthById.set(id, 0)
      strengthById.set(id, 'exact')
    }
    let frontier = [...changedIds]
    for (let depth = 0; depth < maxDepth; depth++) {
      const next: SymbolId[] = []
      for (const id of frontier) {
        const pathStrength = strengthById.get(id) ?? 'exact'
        for (const edge of graph.incoming.get(id) ?? []) {
          if (edge.sourceId === null || changedIds.has(edge.sourceId)) continue
          const caller = graph.symbolsById.get(edge.sourceId)
          if (!caller) continue
          const cumulative = weakest([pathStrength, edge.resolution])
          const row: ImpactRow = {
            symbol: caller,
            depth: depth + 1,
            via: hopOf(edge),
            resolution: cumulative,
          }
          const seen = depthById.get(edge.sourceId)
          if (seen === undefined) {
            depthById.set(edge.sourceId, depth + 1)
            strengthById.set(edge.sourceId, cumulative)
            next.push(edge.sourceId)
            if (depth + 1 >= 2) impactById.set(edge.sourceId, row)
          } else if (seen === depth + 1) {
            const previous = strengthById.get(edge.sourceId) ?? 'exact'
            if (LABEL_STRENGTH[cumulative] > LABEL_STRENGTH[previous]) {
              strengthById.set(edge.sourceId, cumulative)
              if (depth + 1 >= 2) impactById.set(edge.sourceId, row)
            }
          }
        }
      }
      frontier = next
    }
  }
  const allImpact = [...impactById.values()].sort(compareByDepthThenSymbol)

  // Shortest reverse-call paths from entry points to each changed symbol.
  const allPaths: SymbolPath[] = []
  const pathKey = new Set<string>()
  for (const changed of changedSymbols) {
    for (const found of pathsToEntryPoints(changed.symbol, graph, incomingCount, maxDepth)) {
      const key = `${found.entry.id}\u0000${found.changed.id}`
      if (pathKey.has(key)) continue
      pathKey.add(key)
      allPaths.push(found)
    }
  }
  allPaths.sort(comparePaths)

  // Import dependents: reverse module-graph edges of each changed file.
  const importDependents = collectImportDependents(index, moduleGraph, fileSet, changedFiles)

  // Likely affected tests.
  const allTests = collectAffectedTests(
    index,
    moduleGraph,
    changedFiles,
    changedSymbols,
    [...allCallers, ...allImpact],
  )

  const truncated = {
    callers: allCallers.length > maxImpact,
    dependents: importDependents.length > maxImpact,
    paths: allPaths.length > maxPaths,
    impact: allImpact.length > maxImpact,
    tests: allTests.length > maxTests,
  }

  return {
    root: index.root,
    source: input.kind,
    ...(baseRef !== undefined ? { baseRef } : {}),
    changed: changedSymbols,
    unmapped: unmapped.sort(compareUnmapped),
    directCallers: allCallers.slice(0, maxImpact),
    importDependents: importDependents.slice(0, maxImpact),
    paths: allPaths.slice(0, maxPaths),
    impact: allImpact.slice(0, maxImpact),
    tests: allTests.slice(0, maxTests),
    warnings,
    truncated,
  }
}

function hopOf(edge: {
  sourceId: SymbolId | null
  targetId: SymbolId
  callSite: { file: string; line: number }
  resolution: ResolutionLabel
  provenance: ResolutionProvenance
}): ImpactHop {
  return {
    fromId: edge.sourceId,
    toId: edge.targetId,
    callSite: edge.callSite,
    resolution: edge.resolution,
    reason: edge.provenance,
  }
}

async function mapDiffChanges(
  changes: readonly FileChange[],
  symbolsByPath: Map<string, SymbolInfo[]>,
  addChanged: (symbol: SymbolInfo, change: ChangeKind, side: ChangedSymbol['side']) => void,
  addUnmapped: (
    file: string,
    side: UnmappedChange['side'],
    ranges: Array<{ startLine: number; endLine: number }>,
    reason: UnmappedChange['reason'],
  ) => void,
  changedFiles: Set<string>,
  readBaseSymbols: (filePath: string) => Promise<SymbolInfo[] | null>,
  warnings: string[],
): Promise<void> {
  for (const change of changes) {
    const { oldPath, newPath, hunks } = change
    if (newPath) changedFiles.add(newPath)
    if (oldPath) changedFiles.add(oldPath)

    // Current side: hunk ranges that touch the new file.
    const currentSymbols =
      newPath !== null && change.status !== 'deleted' ? symbolsByPath.get(newPath) : undefined
    if (newPath !== null && change.status !== 'deleted') {
      const currentRanges = hunks
        .filter((hunk) => hunk.newLines > 0)
        .map((hunk) => ({
          startLine: hunk.newStart,
          endLine: hunk.newStart + Math.max(hunk.newLines, 1) - 1,
        }))
      if (currentRanges.length > 0 && currentSymbols) {
        for (const range of currentRanges) {
          for (const symbol of currentSymbols) {
            if (intersects(symbol, range)) addChanged(symbol, change.status, 'current')
          }
        }
        const missed = currentRanges.filter(
          (range) => !currentSymbols.some((symbol) => intersects(symbol, range)),
        )
        addUnmapped(newPath, 'current', missed, 'outside-symbol')
      } else if (currentRanges.length > 0) {
        // Changed file is absent from the cached index.
        addUnmapped(newPath, 'current', currentRanges, 'outside-symbol')
      }
    }

    // Base side: deletion-only hunks (newLines === 0) are mapped against the
    // transiently extracted old file; the baseline is never persisted.
    const deletionHunks = hunks.filter((hunk) => hunk.newLines === 0)
    if (deletionHunks.length > 0 && oldPath !== null) {
      const oldRanges = deletionHunks.map((hunk) => ({
        startLine: hunk.oldStart,
        endLine: hunk.oldStart + Math.max(hunk.oldLines, 1) - 1,
      }))
      const oldSymbols = await readBaseSymbols(oldPath)
      if (oldSymbols === null) {
        addUnmapped(oldPath, 'base', oldRanges, 'base-content-unavailable')
      } else {
        const baseChange: ChangeKind = change.status === 'deleted' ? 'deleted' : 'modified'
        for (const range of oldRanges) {
          for (const symbol of oldSymbols) {
            if (intersects(symbol, range)) addChanged(symbol, baseChange, 'base')
          }
        }
        const missed = oldRanges.filter(
          (range) => !oldSymbols.some((symbol) => intersects(symbol, range)),
        )
        addUnmapped(oldPath, 'base', missed, 'outside-symbol')
      }
    }

    if (change.status === 'renamed' && hunks.length === 0) {
      warnings.push(`renamed with no content change: ${oldPath} -> ${newPath}`)
    }
  }
}

function intersects(symbol: SymbolInfo, range: { startLine: number; endLine: number }): boolean {
  return symbol.line <= range.endLine && symbol.endLine >= range.startLine
}

/**
 * BFS over incoming (caller) edges from `changed`; the first time an entry
 * point is reached is a shortest path. Bounded by `maxDepth` so path search
 * and transitive impact cover the same horizon.
 */
function pathsToEntryPoints(
  changed: SymbolInfo,
  graph: ReturnType<typeof buildReferenceGraph>,
  incomingCount: Map<SymbolId, number>,
  maxDepth: number,
): SymbolPath[] {
  const isEntry = (symbol: SymbolInfo): boolean => {
    if (ENTRY_FILE_RE.test(symbol.file)) return true
    if (!symbol.exported) return false
    if (symbol.kind === 'variable') {
      return symbol.scope.length === 0 || (incomingCount.get(symbol.id) ?? 0) === 0
    }
    if (ENTRY_KINDS.has(symbol.kind)) return true
    return (incomingCount.get(symbol.id) ?? 0) === 0
  }

  const found: SymbolPath[] = []
  const depthById = new Map<SymbolId, number>([[changed.id, 0]])
  const strengthById = new Map<SymbolId, ResolutionLabel>([[changed.id, 'exact']])
  const nextEdge = new Map<SymbolId, ImpactHop>()
  const entryIds = new Set<SymbolId>()
  const queue: SymbolId[] = [changed.id]

  while (queue.length > 0) {
    const node = queue.shift()!
    const nodeDepth = depthById.get(node) ?? 0
    if (nodeDepth >= maxDepth) continue
    const nodeStrength = strengthById.get(node) ?? 'exact'
    for (const edge of graph.incoming.get(node) ?? []) {
      if (edge.sourceId === null) continue
      const candidateDepth = nodeDepth + 1
      const cumulative = weakest([nodeStrength, edge.resolution])
      const existingDepth = depthById.get(edge.sourceId)
      if (existingDepth === undefined) {
        depthById.set(edge.sourceId, candidateDepth)
        strengthById.set(edge.sourceId, cumulative)
        nextEdge.set(edge.sourceId, hopOf(edge))
        queue.push(edge.sourceId)
      } else if (existingDepth === candidateDepth) {
        const existingStrength = strengthById.get(edge.sourceId) ?? 'exact'
        if (LABEL_STRENGTH[cumulative] > LABEL_STRENGTH[existingStrength]) {
          strengthById.set(edge.sourceId, cumulative)
          nextEdge.set(edge.sourceId, hopOf(edge))
          queue.push(edge.sourceId)
        }
      }
      const entry = graph.symbolsById.get(edge.sourceId)
      if (entry && isEntry(entry)) entryIds.add(edge.sourceId)
    }
  }

  for (const entryId of entryIds) {
    const entry = graph.symbolsById.get(entryId)
    if (!entry) continue
    const hops: ImpactHop[] = []
    let cursor = entryId
    const guard = new Set<SymbolId>()
    while (cursor !== changed.id && !guard.has(cursor)) {
      guard.add(cursor)
      const hop = nextEdge.get(cursor)
      if (!hop) break
      hops.push(hop)
      cursor = hop.toId
    }
    if (cursor === changed.id && hops.length > 0) {
      found.push({
        entry,
        changed,
        hops,
        resolution: weakest(hops.map((hop) => hop.resolution)),
      })
    }
  }
  return found
}

function collectImportDependents(
  index: RepoIndex,
  moduleGraph: ReturnType<typeof buildModuleGraph>,
  fileSet: Set<string>,
  changedFiles: Set<string>,
): ImportDependent[] {
  const filesByPath = new Map(index.files.map((file) => [file.path, file]))
  const reverse = new Map<string, Set<string>>()
  for (const [from, targets] of moduleGraph.edges) {
    for (const target of targets) {
      const importers = reverse.get(target) ?? new Set<string>()
      importers.add(from)
      reverse.set(target, importers)
    }
  }

  // Deleted/renamed-away files are absent from the module graph, so resolve
  // every file's imports against a set that still contains those paths — one
  // pass total, not one pass per changed file.
  const augmented = new Set([...fileSet, ...changedFiles])
  let reverseImports: Map<string, Set<string>> | null = null
  const reverseImportIndex = (): Map<string, Set<string>> => {
    if (reverseImports) return reverseImports
    const map = new Map<string, Set<string>>()
    for (const file of index.files) {
      for (const info of file.importDetails ?? []) {
        const target = resolveImport(info.specifier, file.path, augmented)
        if (target === null) continue
        const importers = map.get(target) ?? new Set<string>()
        importers.add(file.path)
        map.set(target, importers)
      }
    }
    reverseImports = map
    return map
  }

  const dependents: ImportDependent[] = []
  const seen = new Set<string>()
  for (const changedFile of [...changedFiles].sort((a, b) => a.localeCompare(b))) {
    const importers = new Set(reverse.get(changedFile) ?? [])
    let resolutionSet = fileSet
    if (!fileSet.has(changedFile)) {
      resolutionSet = augmented
      for (const importerPath of reverseImportIndex().get(changedFile) ?? []) {
        importers.add(importerPath)
      }
    }
    for (const importerPath of [...importers].sort((a, b) => a.localeCompare(b))) {
      const importer = filesByPath.get(importerPath)
      if (!importer) continue
      const specifier = specifierFor(importer, changedFile, resolutionSet)
      if (specifier === null) continue
      const key = `${importerPath}\u0000${changedFile}\u0000${specifier}`
      if (seen.has(key)) continue
      seen.add(key)
      dependents.push({
        file: importerPath,
        changedFile,
        specifier,
        resolution: 'import-scoped',
      })
    }
  }
  return dependents.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.changedFile.localeCompare(b.changedFile) ||
      a.specifier.localeCompare(b.specifier),
  )
}

function specifierFor(file: IndexedFile, target: string, fileSet: Set<string>): string | null {
  for (const info of file.importDetails ?? []) {
    if (resolveImport(info.specifier, file.path, fileSet) === target) return info.specifier
  }
  for (const spec of file.imports ?? []) {
    if (resolveImport(spec, file.path, fileSet) === target) return spec
  }
  return null
}

const TEST_RANK: Record<AffectedTest['reason'], number> = {
  'changed-test': 0,
  'imports-changed-file': 1,
  'imports-impact-file': 2,
  'references-symbol-name': 3,
  'path-convention': 4,
}

function collectAffectedTests(
  index: RepoIndex,
  moduleGraph: ReturnType<typeof buildModuleGraph>,
  changedFiles: Set<string>,
  changedSymbols: readonly ChangedSymbol[],
  impactRows: readonly ImpactRow[],
): AffectedTest[] {
  const changedNames = new Set(changedSymbols.map((changed) => changed.symbol.name))
  const impactFileDepth = new Map<string, number>()
  for (const row of impactRows) {
    const previous = impactFileDepth.get(row.symbol.file)
    if (previous === undefined || row.depth < previous) {
      impactFileDepth.set(row.symbol.file, row.depth)
    }
  }
  const changedStems = new Set([...changedFiles].map(pathStem))

  const tests: AffectedTest[] = []
  for (const file of index.files) {
    if (!TEST_RE.test(file.path)) continue
    const imports = moduleGraph.edges.get(file.path) ?? new Set<string>()

    if (changedFiles.has(file.path)) {
      tests.push({ file: file.path, resolution: 'exact', reason: 'changed-test', distance: 0 })
      continue
    }

    const changedImport = [...imports].find(
      (target) => changedFiles.has(target) && target !== file.path,
    )
    if (changedImport !== undefined) {
      tests.push({
        file: file.path,
        resolution: 'import-scoped',
        reason: 'imports-changed-file',
        distance: 1,
      })
      continue
    }

    const impactImports = [...imports]
      .filter((target) => impactFileDepth.has(target))
      .sort((a, b) => (impactFileDepth.get(a) ?? 0) - (impactFileDepth.get(b) ?? 0))
    if (impactImports.length > 0) {
      tests.push({
        file: file.path,
        resolution: 'import-scoped',
        reason: 'imports-impact-file',
        distance: impactFileDepth.get(impactImports[0]!) ?? 2,
      })
      continue
    }

    if ((file.calls ?? []).some((call) => changedNames.has(call.name))) {
      tests.push({
        file: file.path,
        resolution: 'name-only',
        reason: 'references-symbol-name',
        distance: 1,
      })
      continue
    }

    if (changedStems.has(pathStem(file.path))) {
      tests.push({ file: file.path, resolution: 'name-only', reason: 'path-convention' })
    }
  }

  return tests.sort(
    (a, b) =>
      TEST_RANK[a.reason] - TEST_RANK[b.reason] ||
      (a.distance ?? Number.MAX_SAFE_INTEGER) - (b.distance ?? Number.MAX_SAFE_INTEGER) ||
      a.file.localeCompare(b.file),
  )
}

/** Basename stem with test markers removed (`a/foo.test.ts` -> `foo`). */
function pathStem(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/\.(?:test|spec)$/, '')
    .replace(/^test_/, '')
    .replace(/_test$/, '')
}

function compareChanged(a: ChangedSymbol, b: ChangedSymbol): number {
  return (
    a.side.localeCompare(b.side) ||
    a.symbol.file.localeCompare(b.symbol.file) ||
    a.symbol.line - b.symbol.line ||
    a.symbol.id.localeCompare(b.symbol.id)
  )
}

function compareBySymbol(a: ImpactRow, b: ImpactRow): number {
  return (
    a.symbol.file.localeCompare(b.symbol.file) ||
    a.symbol.line - b.symbol.line ||
    a.symbol.id.localeCompare(b.symbol.id)
  )
}

function compareByDepthThenSymbol(a: ImpactRow, b: ImpactRow): number {
  return (
    a.depth - b.depth ||
    LABEL_STRENGTH[b.resolution] - LABEL_STRENGTH[a.resolution] ||
    compareBySymbol(a, b)
  )
}

function comparePaths(a: SymbolPath, b: SymbolPath): number {
  return (
    a.entry.file.localeCompare(b.entry.file) ||
    a.entry.line - b.entry.line ||
    a.changed.file.localeCompare(b.changed.file) ||
    a.changed.line - b.changed.line ||
    a.entry.id.localeCompare(b.entry.id)
  )
}

function compareUnmapped(a: UnmappedChange, b: UnmappedChange): number {
  return a.file.localeCompare(b.file) || a.side.localeCompare(b.side)
}

/* -------------------------------------------------------------------------- */
/* Renderer                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Render the result as fixed skeleton sections. Section headers and warnings
 * are always kept; rows are trimmed to the final character cap, which then
 * appends an explicit truncation line.
 */
export function renderChangeContext(result: ChangeContextResult, maxChars = 12_000): string {
  const sections: Array<{ title: string; rows: string[] }> = [
    {
      title: 'CHANGED',
      rows: result.changed.map(
        (changed) =>
          `${changed.change} ${changed.side === 'base' ? 'base ' : ''}${symbolLabel(changed.symbol)} ${changed.symbol.file}:${changed.symbol.line} [${changed.resolution}]`,
      ),
    },
    {
      title: 'DIRECT CALLERS',
      rows: result.directCallers.map(
        (row) =>
          `${symbolLabel(row.symbol)} ${row.symbol.file}:${row.symbol.line} (called at ${row.via.callSite.file}:${row.via.callSite.line}) [${row.resolution}]`,
      ),
    },
    {
      title: 'IMPORT DEPENDENTS',
      rows: result.importDependents.map(
        (dependent) =>
          `${dependent.file} imports ${dependent.changedFile} ('${dependent.specifier}') [${dependent.resolution}]`,
      ),
    },
    {
      title: 'SHORTEST PATHS TO ENTRY POINTS',
      rows: result.paths.map(
        (symbolPath) =>
          `${symbolPath.entry.file}:${symbolPath.entry.line} ${symbolLabel(symbolPath.entry)} → ${symbolPath.changed.file}:${symbolPath.changed.line} ${symbolLabel(symbolPath.changed)} (${symbolPath.hops.length} hop(s)) [${symbolPath.resolution}]`,
      ),
    },
    {
      title: 'TRANSITIVE IMPACT',
      rows: result.impact.map(
        (row) =>
          `depth ${row.depth}: ${symbolLabel(row.symbol)} ${row.symbol.file}:${row.symbol.line} (reached via ${row.via.callSite.file}:${row.via.callSite.line}) [${row.resolution}]`,
      ),
    },
    {
      title: 'LIKELY AFFECTED TESTS',
      rows: result.tests.map(
        (test) =>
          `${test.file} (${test.reason}${test.distance !== undefined ? `, distance ${test.distance}` : ''}) [${test.resolution}]`,
      ),
    },
    {
      title: 'UNMAPPED',
      rows: result.unmapped.map(
        (entry) =>
          `${entry.file} ${entry.side} lines ${entry.ranges.map((range) => `${range.startLine}-${range.endLine}`).join(', ')} (${entry.reason})`,
      ),
    },
  ]

  const summary = `change context — source: ${result.source}${
    result.baseRef !== undefined ? ` (base ${result.baseRef})` : ''
  }: ${result.changed.length} changed symbol(s)`
  const warningLines = result.warnings.map((warning) => `- ${warning}`)

  const render = (kept: readonly number[]): string => {
    const lines: string[] = [summary]
    sections.forEach((section, index) => {
      if (section.rows.length === 0) {
        lines.push(`${section.title}: (none)`)
        return
      }
      lines.push(`${section.title}:`)
      const take = kept[index] ?? 0
      for (let row = 0; row < take; row++) lines.push(`  ${section.rows[row]}`)
      if (take < section.rows.length) lines.push(`  … (${section.rows.length - take} more)`)
    })
    lines.push('WARNINGS:')
    if (warningLines.length === 0) lines.push('  (none)')
    else for (const warning of warningLines) lines.push(`  ${warning}`)
    return lines.join('\n')
  }

  const flattened: Array<{ section: number; text: string }> = []
  sections.forEach((section, index) => {
    section.rows.forEach((text) => flattened.push({ section: index, text }))
  })

  const countsFor = (count: number): number[] => {
    const kept = sections.map(() => 0)
    for (let index = 0; index < count; index++) kept[flattened[index]!.section]!++
    return kept
  }

  const total = flattened.length
  const full = render(sections.map((section) => section.rows.length))
  if (full.length <= maxChars) return full

  const truncationNote =
    '\n… truncated rows to fit the character cap (raise maxChars or narrow the change)'
  const headerOnly = render(countsFor(0))
  if (headerOnly.length > maxChars) {
    throw new Error(
      `maxChars ${maxChars} is below the renderer minimum ${headerOnly.length} (section headers and warnings cannot be kept)`,
    )
  }
  if (headerOnly.length + truncationNote.length > maxChars) return headerOnly

  const fits = (count: number): boolean =>
    render(countsFor(count)).length + truncationNote.length <= maxChars

  let lo = 0
  let hi = total
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(mid)) lo = mid
    else hi = mid - 1
  }

  let out = render(countsFor(lo))
  if (lo < total) out += truncationNote
  return out
}
