/**
 * Task-aware structural context orchestration.
 *
 * This module deliberately contains no parser, search index, graph, or git
 * implementation of its own. It ranks the existing primitives into a compact
 * package that answers the question: which code matters for this task?
 */

import { buildChangeContext, type ChangeContextResult } from './change-context.js'
import { rankRepoMap, scoreFile } from './repomap.js'
import {
  buildReferenceGraph,
  callerCounts,
  type ReferenceEdge,
  type ResolutionLabel,
} from './refgraph.js'
import { searchSymbols, type RankedHit } from './search.js'
import type { RepoIndex, SymbolInfo } from './types.js'

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
}

export interface ContextConfidence {
  exact: number
  'import-scoped': number
  'name-only': number
}

export interface TaskContextResult {
  root: string
  task: string
  route: ContextRoute
  primarySymbols: ContextSymbol[]
  relevantFiles: ContextFile[]
  relationships: ContextRelationship[]
  changeContext: ChangeContextResult | null
  tests: string[]
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
    const candidate: ContextSymbol = { symbol: hit, score, provenance: exact ? 'exact' : 'lexical' }
    const previous = byId.get(hit.id)
    if (!previous || candidate.score > previous.score) byId.set(hit.id, candidate)
  }

  // A changed file may contain symbols that were not named in the task. They
  // are important enough to enter the primary set for change-aware tasks.
  if (route.includeChangeContext) {
    for (const file of index.files) {
      if (!changedFiles.has(file.path)) continue
      for (const symbol of file.symbols) {
        if (byId.has(symbol.id)) continue
        byId.set(symbol.id, {
          symbol,
          score: 70,
          provenance: 'lexical',
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
      priority,
    })
  }
  for (const candidate of primary) {
    for (const edge of graph.incoming.get(candidate.symbol.id) ?? []) add(edge, 'caller', 100)
    for (const edge of graph.outgoing.get(candidate.symbol.id) ?? []) add(edge, 'callee', 90)
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

function renderRows(
  result: Omit<TaskContextResult, 'budget'>,
  budgetChars: number,
): { text: string; usedChars: number; truncated: boolean } {
  const lines = [
    `Task context — ${result.route.kind}`,
    `Task: ${result.task}`,
    `Sources: ${result.route.sources.join(', ')}`,
    '',
    'Primary symbols:',
  ]
  if (result.primarySymbols.length === 0) lines.push('- (none found)')

  const optional: Array<{ priority: number; key: string; line: string; section: string }> = []
  for (const candidate of result.primarySymbols) {
    optional.push({
      priority: 1000 + candidate.score,
      key: `symbol:${candidate.symbol.id}`,
      section: 'primary',
      line: `- [${candidate.provenance}] ${symbolLabel(candidate.symbol)}`,
    })
  }
  optional.push({ priority: 700, key: 'files-header', section: 'files', line: '\nRelevant files:' })
  for (const file of result.relevantFiles) {
    optional.push({ priority: 500 + file.score, key: `file:${file.path}`, section: 'files', line: `- ${file.path} (${file.reason})` })
  }
  optional.push({ priority: 400, key: 'relationships-header', section: 'relationships', line: '\nRelationships:' })
  for (const relation of result.relationships) {
    optional.push({ priority: relation.priority, key: `relation:${relation.key}`, section: 'relationships', line: `- ${relation.text}` })
  }
  if (result.changeContext) {
    optional.push({ priority: 850, key: 'changes-header', section: 'changes', line: '\nCurrent changes:' })
    for (const changed of result.changeContext.changed) {
      optional.push({
        priority: 840,
        key: `changed:${changed.side}:${changed.symbol.id}`,
        section: 'changes',
        line: `- ${changed.change} ${symbolLabel(changed.symbol)} [${changed.resolution}]`,
      })
    }
    if (result.changeContext.unmapped.length > 0) {
      optional.push({
        priority: 830,
        key: 'changes-unmapped',
        section: 'changes',
        line: `- unmapped: ${result.changeContext.unmapped.map((entry) => entry.file).join(', ')}`,
      })
    }
  }
  if (result.tests.length > 0) {
    optional.push({ priority: 350, key: 'tests-header', section: 'tests', line: '\nLikely affected tests:' })
    for (const test of result.tests) optional.push({ priority: 340, key: `test:${test}`, section: 'tests', line: `- ${test}` })
  }
  if (result.warnings.length > 0) {
    optional.push({ priority: 200, key: 'warnings-header', section: 'warnings', line: '\nWarnings:' })
    for (const warning of result.warnings) optional.push({ priority: 190, key: `warning:${warning}`, section: 'warnings', line: `- ${warning}` })
  }

  // Keep core sections ahead of weak candidates while preserving deterministic
  // order inside each priority band. Reserve room for the accounting footer.
  const ordered = optional
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => b.priority - a.priority || a.index - b.index || a.key.localeCompare(b.key))
  const footerReserve = 100
  let truncated = false
  const seen = new Set<string>()
  for (const item of ordered) {
    if (seen.has(item.key)) continue
    const next = lines.join('\n') + `\n${item.line}`
    if (next.length + footerReserve > budgetChars) {
      truncated = true
      continue
    }
    seen.add(item.key)
    lines.push(item.line)
  }
  lines.push(
    '',
    `Confidence: exact ${result.confidence.exact}; import-scoped ${result.confidence['import-scoped']}; name-only ${result.confidence['name-only']}`,
  )
  const body = lines.join('\n')
  const withFooter = (bodyText: string, wasTruncated: boolean): { text: string; usedChars: number } => {
    let usedChars = bodyText.length + 1
    for (let iteration = 0; iteration < 10; iteration++) {
      const footer = `Budget: ${usedChars} / ${budgetChars} chars${wasTruncated ? ' (trimmed low-priority context)' : ''}`
      const text = `${bodyText}\n${footer}`
      const nextUsedChars = text.length
      if (nextUsedChars === usedChars) return { text, usedChars: nextUsedChars }
      usedChars = nextUsedChars
    }
    const footer = `Budget: ${usedChars} / ${budgetChars} chars${wasTruncated ? ' (trimmed low-priority context)' : ''}`
    const text = `${bodyText}\n${footer}`
    return { text, usedChars: text.length }
  }

  const complete = withFooter(body, truncated)
  if (complete.usedChars <= budgetChars) {
    return { text: complete.text, usedChars: complete.usedChars, truncated }
  }

  // The optional-row reserve above is intentionally conservative, but the
  // task and confidence lines are user-controlled/derived text. If they still
  // push the result over budget, truncate the body and recompute the footer so
  // both the bytes and the accounting remain truthful.
  truncated = true
  const candidate = (prefixLength: number): { text: string; usedChars: number } => {
    const prefix = `${body.slice(0, prefixLength).trimEnd()}…`
    return withFooter(prefix, true)
  }
  let low = 0
  let high = body.length
  let best = candidate(0)
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const current = candidate(middle)
    if (current.usedChars <= budgetChars) {
      best = current
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return { text: best.text, usedChars: best.usedChars, truncated }
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
        priority: 110,
      })
    }
    relationships.sort((a, b) => b.priority - a.priority || a.text.localeCompare(b.text))
  }
  const relevantFiles = gatherFiles(index, route, primarySymbols, changeContext, maxFiles)
  const tests = unique(changeContext?.tests.map((test) => test.file) ?? [], (file) => file)
  const confidence = confidenceOf(primarySymbols, relationships, changeContext)
  const partial: Omit<TaskContextResult, 'budget'> = {
    root: index.root,
    task,
    route,
    primarySymbols,
    relevantFiles,
    relationships,
    changeContext,
    tests,
    confidence,
    warnings,
  }
  const rendered = renderRows(partial, budgetChars)
  return {
    ...partial,
    budget: {
      usedChars: rendered.usedChars,
      budgetChars,
      truncated: rendered.truncated,
    },
  }
}

/** Render the result using the same compact text surface as the existing tools. */
export function renderTaskContext(result: TaskContextResult): string {
  const rendered = renderRows(result, result.budget.budgetChars)
  return rendered.text
}
