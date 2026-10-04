/**
 * Task-aware structural context orchestration.
 *
 * This module deliberately contains no parser, search index, graph, or git
 * implementation of its own. It ranks the existing primitives into a compact
 * package that answers the question: which code matters for this task?
 */

import { buildChangeContext, collectSeedTests, type AffectedTest, type ChangeContextResult } from './change-context.js'
import { rankRepoMap, scoreFile } from './repomap.js'
import {
  buildReferenceGraph,
  callerCounts,
  type ReferenceEdge,
  type ResolutionLabel,
} from './refgraph.js'
import { searchSymbols, type RankedHit } from './search.js'
import type { RepoIndex, SymbolInfo } from './types.js'
import { selectContextPack, renderContextPack, type ContextPack } from './context-pack.js'

export type ContextTaskKind =
  | 'change'
  | 'symbol'
  | 'architecture'
  | 'test'
  | 'exploration'
  | 'ambiguous'

export interface ContextRoute {
  kind: ContextTaskKind
  queries: string[]
  mentionedFiles: string[]
  exactSymbolNames: string[]
  sources: string[]
  includeChangeContext: boolean
  includeRelationships: boolean
}

export interface ContextOptions {
  budgetChars?: number
  maxFiles?: number
  maxSymbols?: number
}

export interface ContextSymbol {
  symbol: SymbolInfo
  score: number
  provenance: 'exact' | 'lexical'
  reason: string
}

export interface ContextFile {
  path: string
  score: number
  reason: string
}

export interface ContextRelationship {
  text: string
  resolution: ResolutionLabel
  priority: number
  key: string
  provenance: string
}

export interface ContextConfidence {
  exact: number
  'import-scoped': number
  'name-only': number
}

export interface TaskContextResult {
  pack: ContextPack
  root: string
  task: string
  route: ContextRoute
  primarySymbols: ContextSymbol[]
  relevantFiles: ContextFile[]
  relationships: ContextRelationship[]
  changeContext: ChangeContextResult | null
  tests: string[]
  testEvidence: AffectedTest[]
  confidence: ContextConfidence
  warnings: string[]
  budget: {
    usedChars: number
    budgetChars: number
    truncated: boolean
  }
}

const TEST_PATH_RE =
  /(^|\/)(tests?|__tests__)(\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$|(^|\/)(?:test_[^/]+\.py|[^/]+_test\.(?:py|go))$/i
const FILE_TOKEN_RE = /[A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+/g
const CODE_TOKEN_RE = /[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)?/g
const STOP_WORDS = new Set(
  [
    'a',
    'an',
    'and',
    'are',
    'be',
    'by',
    'does',
    'for',
    'from',
    'how',
    'in',
    'is',
    'it',
    'my',
    'of',
    'on',
    'or',
    'the',
    'this',
    'to',
    'what',
    'where',
    'why',
    'with',
  ],
)

const CHANGE_RE =
  /\b(fix|bug|broken|breaks?|change|changed|current|working\s+tree|regression|impact|modified|duplicate|fails?|failure)\b/i
const TEST_RE = /\b(test|tests|spec|specs|failing|assert|coverage)\b/i
const ARCH_RE =
  /\b(architecture|architectural|flow|loading|authentication|authorization|plugin|startup|overview|pipeline|lifecycle|design|works?)\b/i
const EXPLORE_RE =
  /\b(where|implement|add|feature|introduce|entry\s+point|similar|explore|understand|locate)\b/i

function unique<T>(values: readonly T[], key: (value: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const value of values) {
    const id = key(value)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(value)
  }
  return out
}

function clamp(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function wordBoundary(name: string): RegExp {
  return new RegExp(`(^|[^A-Za-z0-9_$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^A-Za-z0-9_$])`)
}

function symbolLabel(symbol: SymbolInfo): string {
  return `${symbol.kind} ${symbol.signature || symbol.name} — ${symbol.file}:${symbol.line}`
}

function isTestFile(file: string): boolean {
  return TEST_PATH_RE.test(file)
}

function fileMentionMatches(file: string, mentions: readonly string[]): boolean {
  const lower = file.toLowerCase()
  return mentions.some((mention) => {
    const normalized = mention.replace(/\\/g, '/').toLowerCase()
    return lower === normalized || lower.endsWith(`/${normalized}`) || lower.includes(normalized)
  })
}

/** Classify a task and decide which existing primitives should be composed. */
export function routeTask(task: string, index?: RepoIndex): ContextRoute {
  const text = task.trim()
  const mentionedFiles = unique(text.match(FILE_TOKEN_RE) ?? [], (value) => value.toLowerCase())
    .map((value) => value.replace(/\\/g, '/'))
    .filter((value) => !index || index.files.some((file) => fileMentionMatches(file.path, [value])))

  const exactSymbolNames = index
    ? unique(
        index.files.flatMap((file) => file.symbols.map((symbol) => symbol.name)),
        (name) => name,
      )
        .filter((name) => wordBoundary(name).test(text))
        .sort((a, b) => b.length - a.length || a.localeCompare(b))
    : []

  const codeTokens = unique(
    (text.match(CODE_TOKEN_RE) ?? [])
      .map((token) => token.replace(/^[^A-Za-z_$]+|[^A-Za-z0-9_$]+$/g, ''))
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token.toLowerCase())),
    (token) => token.toLowerCase(),
  )
  const queries = unique(
    [...exactSymbolNames, ...codeTokens.filter((token) => !exactSymbolNames.includes(token))],
    (value) => value.toLowerCase(),
  ).slice(0, 12)

  const kind: ContextTaskKind = TEST_RE.test(text) || mentionedFiles.some(isTestFile)
      ? 'test'
      : CHANGE_RE.test(text)
        ? 'change'
      : exactSymbolNames.length > 0
        ? 'symbol'
        : EXPLORE_RE.test(text)
          ? 'exploration'
          : ARCH_RE.test(text)
            ? 'architecture'
            : 'ambiguous'

  const includeChangeContext = kind === 'change' || kind === 'test'
  const includeRelationships = kind === 'change' || kind === 'test' || kind === 'symbol'
  const sources = new Set<string>()
  if (kind === 'change' || kind === 'test') sources.add('change context')
  if (kind === 'architecture' || kind === 'exploration' || kind === 'ambiguous') {
    sources.add('repo map')
  }
  if (queries.length > 0) sources.add('ranked search')
  if (includeRelationships) sources.add('call graph')
  if (mentionedFiles.length > 0) sources.add('file relevance')
  if (sources.size === 0) sources.add('repo map')

  return {
    kind,
    queries,
    mentionedFiles,
    exactSymbolNames,
    sources: [...sources],
    includeChangeContext,
    includeRelationships,
  }
}

function routeScore(route: ContextRoute, hit: RankedHit): number {
  let score = hit.score * 30
  if (route.exactSymbolNames.includes(hit.name)) score += 100
  if (fileMentionMatches(hit.file, route.mentionedFiles)) score += 30
  if (isTestFile(hit.file) && route.kind !== 'test') score -= 10
  // Structural importance is deliberately capped: it breaks ties but cannot
  // displace a task-specific symbol match.
  return score
}

function gatherPrimarySymbols(
  index: RepoIndex,
  route: ContextRoute,
  maxSymbols: number,
  changedIds: Set<string>,
  changedFiles: Set<string>,
  refs: Map<string, number>,
): ContextSymbol[] {
  const hits: RankedHit[] = []
  for (const query of route.queries) {
    hits.push(...searchSymbols(index, { query }, Math.max(maxSymbols * 3, 20), refs))
  }
  const byId = new Map<string, ContextSymbol>()
  for (const hit of hits) {
    const exact = route.exactSymbolNames.includes(hit.name)
    let score = routeScore(route, hit)
    if (changedIds.has(hit.id)) score += 80
    else if (changedFiles.has(hit.file)) score += 55
    if (route.kind === 'test' && isTestFile(hit.file)) score += 35
    const candidate: ContextSymbol = { symbol: hit, score, provenance: exact ? 'exact' : 'lexical',
      reason: exact ? 'task names this symbol' : 'matches task terms' }
    const previous = byId.get(hit.id)
    if (!previous || candidate.score > previous.score) byId.set(hit.id, candidate)
  }

  // A changed file may contain symbols that were not named in the task. They
  // are important enough to enter the primary set for change-aware tasks.
  if (route.includeChangeContext) {
    for (const file of index.files) {
      for (const symbol of file.symbols) {
        if (!changedIds.has(symbol.id)) continue
        if (byId.has(symbol.id)) continue
        byId.set(symbol.id, {
          symbol,
          score: 70,
          provenance: 'lexical',
          reason: 'declaration intersects current change',
        })
      }
    }
  }

  return [...byId.values()]
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.provenance === 'exact') - Number(a.provenance === 'exact') ||
        a.symbol.file.localeCompare(b.symbol.file) ||
        a.symbol.line - b.symbol.line ||
        a.symbol.id.localeCompare(b.symbol.id),
    )
    .slice(0, maxSymbols)
}

function edgeText(
  graph: ReturnType<typeof buildReferenceGraph>,
  edge: ReferenceEdge,
  direction: 'caller' | 'callee',
): string {
  const source = edge.sourceId ? graph.symbolsById.get(edge.sourceId) : undefined
  const target = graph.symbolsById.get(edge.targetId)
  const sourceText = source ? `${source.name} (${source.file}:${source.line})` : 'module'
  const targetText = target ? `${target.name} (${target.file}:${target.line})` : edge.name
  const arrow = direction === 'caller' ? `${sourceText} → ${targetText}` : `${sourceText} → ${targetText}`
  return `${arrow} at ${edge.callSite.file}:${edge.callSite.line} [${edge.resolution}; ${edge.provenance}]`
}

function collectRelationships(
  graph: ReturnType<typeof buildReferenceGraph>,
  primary: readonly ContextSymbol[],
): ContextRelationship[] {
  const rows: ContextRelationship[] = []
  const seen = new Set<string>()
  const add = (edge: ReferenceEdge, direction: 'caller' | 'callee', priority: number): void => {
    const key = `${edge.sourceId ?? 'module'}:${edge.targetId}:${edge.callSite.file}:${edge.callSite.line}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({
      key,
      text: edgeText(graph, edge, direction),
      resolution: edge.resolution,
      provenance: edge.provenance,
      priority,
    })
  }
  for (const candidate of primary) {
    for (const edge of (graph.incoming.get(candidate.symbol.id) ?? []).slice(0, 8)) add(edge, 'caller', 100)
    for (const edge of (graph.outgoing.get(candidate.symbol.id) ?? []).slice(0, 8)) add(edge, 'callee', 90)
  }
  return rows.sort(
    (a, b) =>
      b.priority - a.priority ||
      a.resolution.localeCompare(b.resolution) ||
      a.text.localeCompare(b.text),
  )
}

function addFile(
  files: Map<string, ContextFile>,
  path: string,
  score: number,
  reason: string,
): void {
  const previous = files.get(path)
  if (!previous || score > previous.score) files.set(path, { path, score, reason })
}

function gatherFiles(
  index: RepoIndex,
  route: ContextRoute,
  primary: readonly ContextSymbol[],
  change: ChangeContextResult | null,
  maxFiles: number,
): ContextFile[] {
  const files = new Map<string, ContextFile>()
  for (const file of index.files) {
    const base = Math.min(scoreFile(file), 8)
    if (route.kind === 'architecture' || route.kind === 'exploration' || route.kind === 'ambiguous') {
      addFile(files, file.path, base, 'structural importance')
    }
    if (fileMentionMatches(file.path, route.mentionedFiles)) addFile(files, file.path, 120, 'task-mentioned file')
  }
  for (const candidate of primary) {
    addFile(files, candidate.symbol.file, candidate.score + 45, 'primary symbol')
  }
  if (change) {
    for (const changed of change.changed) addFile(files, changed.symbol.file, 115, 'current change')
    for (const dependent of change.importDependents) addFile(files, dependent.file, 65, 'import dependent')
    for (const test of change.tests) addFile(files, test.file, 75, 'likely affected test')
    for (const pathRow of change.paths) {
      addFile(files, pathRow.entry.file, 60, 'entry path')
      addFile(files, pathRow.changed.file, 90, 'changed path')
    }
  }
  for (const entry of rankRepoMap(index, { topFiles: maxFiles * 2, symbolsPerFile: 8 })) {
    addFile(files, entry.path, Math.min(35, entry.score + 10), 'repo map')
  }
  return [...files.values()]
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, maxFiles)
}

function confidenceOf(
  primary: readonly ContextSymbol[],
  relationships: readonly ContextRelationship[],
  change: ChangeContextResult | null,
): ContextConfidence {
  const out: ContextConfidence = { exact: 0, 'import-scoped': 0, 'name-only': 0 }
  for (const symbol of primary) if (symbol.provenance === 'exact') out.exact++
  for (const relation of relationships) out[relation.resolution]++
  if (change) {
    for (const row of [...change.directCallers, ...change.impact]) out[row.resolution]++
    for (const dependent of change.importDependents) out[dependent.resolution]++
    for (const test of change.tests) out[test.resolution]++
  }
  return out
}

/** Build a deterministic, bounded context package from the current task. */
export async function buildTaskContext(
  index: RepoIndex,
  task: string,
  options: ContextOptions = {},
): Promise<TaskContextResult> {
  const budgetChars = clamp(options.budgetChars, 300, 20_000, 5_000)
  const maxFiles = clamp(options.maxFiles, 1, 50, 12)
  const maxSymbols = clamp(options.maxSymbols, 1, 50, 10)
  const route = routeTask(task, index)
  let changeContext: ChangeContextResult | null = null
  const warnings: string[] = []

  if (route.includeChangeContext) {
    try {
      changeContext = await buildChangeContext(index, {
        kind: 'git',
        root: index.root,
        baseRef: 'HEAD',
      })
      warnings.push(...changeContext.warnings)
    } catch (error) {
      warnings.push(`change context unavailable: ${(error as Error).message ?? String(error)}`)
    }
  }

  const changedIds = new Set((changeContext?.changed ?? []).map((entry) => entry.symbol.id))
  const changedFiles = new Set((changeContext?.changed ?? []).map((entry) => entry.symbol.file))
  const primarySymbols = gatherPrimarySymbols(
    index,
    route,
    maxSymbols,
    changedIds,
    changedFiles,
    callerCounts(index),
  )
  const graph = route.includeRelationships ? buildReferenceGraph(index) : null
  const relationships = graph ? collectRelationships(graph, primarySymbols) : []
  if (changeContext) {
    const existing = new Set(relationships.map((row) => row.key))
    for (const row of changeContext.directCallers) {
      const key = `change:${row.symbol.id}:${row.via.callSite.file}:${row.via.callSite.line}`
      if (existing.has(key)) continue
      existing.add(key)
      relationships.push({
        key,
        text: `${row.symbol.name} (${row.symbol.file}:${row.symbol.line}) → changed symbol at ${row.via.callSite.file}:${row.via.callSite.line} [${row.resolution}; ${row.via.reason}]`,
        resolution: row.resolution,
        provenance: row.via.reason,
        priority: 110,
      })
    }
    relationships.sort((a, b) => b.priority - a.priority || a.text.localeCompare(b.text))
  }
  const relevantFiles = gatherFiles(index, route, primarySymbols, changeContext, maxFiles)
  const testEvidence = unique([
    ...collectSeedTests(index, primarySymbols.filter(seed => seed.provenance === 'exact' || seed.score >= 20).map(seed => seed.symbol)),
    ...(changeContext?.tests ?? []),
  ], test => test.file).slice(0, 8)
  const tests = testEvidence.map(test => test.file)
  const confidence = confidenceOf(primarySymbols, relationships, changeContext)
  const partial: Omit<TaskContextResult, 'budget' | 'pack'> = {
    root: index.root,
    task,
    route,
    primarySymbols,
    relevantFiles,
    relationships,
    changeContext,
    tests,
    testEvidence,
    confidence,
    warnings,
  }
  const pack = await selectContextPack(index, partial, budgetChars)
  const selected = (file: string, name?: string, kind?: string): boolean => pack.items.some(item =>
    item.file === file && (!name || item.name === name) && (!kind || item.kind === kind))
  const selectedRelationships = relationships.filter(row => pack.items.some(item => item.text === row.text))
  const selectedChange = changeContext ? {
    ...changeContext,
    changed: changeContext.changed.filter(row => pack.items.some(item => item.file === row.symbol.file &&
      item.name === row.symbol.name && item.side === row.side && item.change === row.change)),
    unmapped: [], directCallers: [], importDependents: [], paths: [], impact: [],
    tests: changeContext.tests.filter(test => selected(test.file, undefined, 'test')),
    warnings: pack.gaps,
  } : null
  return {
    ...partial, pack,
    primarySymbols: primarySymbols.filter(seed => selected(seed.symbol.file, seed.symbol.name, 'primary')),
    relevantFiles: relevantFiles.filter(file => selected(file.path)),
    relationships: selectedRelationships,
    changeContext: selectedChange,
    tests: tests.filter(file => selected(file, undefined, 'test')),
    testEvidence: testEvidence.filter(test => selected(test.file, undefined, 'test')),
    confidence: confidenceOf([], selectedRelationships, null),
    warnings: pack.gaps,
    budget: { usedChars: pack.budget.usedChars, budgetChars, truncated: pack.budget.truncated },
  }
}

/** Text always renders the final selected pack. */
export function renderTaskContext(result: TaskContextResult): string {
  return renderContextPack(result.pack)
}
