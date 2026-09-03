/**
 * Bounded, ranked repo map generation — the "aider-style" overview the model
 * can turn to before browsing files. Pure logic, no IO.
 */

import path from 'node:path'
import { SUPPORTED_EXTS } from './scan.js'
import type { IndexedFile, RepoIndex, SymbolInfo, SymbolKind } from './types.js'

/** Higher-weight symbols pull their file up the map. */
export const KIND_WEIGHT: Record<SymbolKind, number> = {
  class: 1.0,
  interface: 1.0,
  type: 0.8,
  function: 0.8,
  method: 0.7,
  enum: 0.9,
  variable: 0.25,
  field: 0.2,
  import: 0.05,
  module: 0.3,
}

export interface RepoMapOptions {
  /** Max files to include (default 24). */
  topFiles?: number
  /** Max symbols per file (default 18). */
  symbolsPerFile?: number
  /** Hard cap on rendered characters (default 3200). */
  maxChars?: number
}

export interface RepoMapEntry {
  path: string
  score: number
  symbols: Array<{ name: string; kind: SymbolKind; line: number; signature: string }>
}

/**
 * Paths that look like tests. A map led by test files reads as noise: tests
 * reference an API, they rarely explain it — and symbol density actively
 * favours them (many small functions), so they need an explicit damper.
 */
const TEST_PATH_RE =
  /(^|\/)(tests?|__tests__)(\/|$)|\.(?:spec|test)\.[cm]?[jt]sx?$|(^|\/)(?:test_[^/]+\.py|[^/]+_test\.(?:py|go))$/

/** Density-aware file score: weighted symbols minus bloat; test paths damped. */
export function scoreFile(file: IndexedFile): number {
  let score = 0
  for (const sym of file.symbols) {
    score += KIND_WEIGHT[sym.kind] ?? 0.3
    if (sym.exported) score += 0.3
  }
  score /= 1 + file.symbols.length * 0.04
  if (TEST_PATH_RE.test(file.path)) score *= 0.2
  return score
}

/** Rank files, take the top slice, cap per-file symbols. */
export function rankRepoMap(index: RepoIndex, options: RepoMapOptions = {}): RepoMapEntry[] {
  const topFiles = options.topFiles ?? 24
  const perFile = options.symbolsPerFile ?? 18
  const density = new Map<string, number>()
  for (const f of index.files) {
    if (f.symbols.length > 0) density.set(f.path, scoreFile(f))
  }
  const centrality = referencePageRank(index.files, density)
  const ranked = index.files
    .filter((f) => f.symbols.length > 0)
    .map((f) => ({
      file: f,
      score: (density.get(f.path) ?? 0) + REF_WEIGHT * (centrality.get(f.path) ?? 0),
    }))
    .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path))
    .slice(0, topFiles)

  return ranked.map(({ file, score }) => ({
    path: file.path,
    score,
    symbols: file.symbols.slice(0, perFile).map((s) => ({
      name: s.name,
      kind: s.kind,
      line: s.line,
      signature: s.signature,
    })),
  }))
}

/** How much one unit of reference centrality is worth in map score. */
const REF_WEIGHT = 0.5

/**
 * Count in-repo references: how many OTHER indexed files import each file.
 * Self-imports don't count; each (importer, target) pair counts once.
 */
export function countReferences(files: IndexedFile[]): Map<string, number> {
  const fileSet = new Set(files.map((f) => f.path))
  const counts = new Map<string, number>()
  for (const file of files) {
    const targets = new Set<string>()
    for (const spec of file.imports ?? []) {
      const target = resolveImport(spec, file.path, fileSet)
      if (target && target !== file.path) targets.add(target)
    }
    for (const target of targets) {
      counts.set(target, (counts.get(target) ?? 0) + 1)
    }
  }
  return counts
}

/** PageRank damping — the standard 0.85. */
const DAMPING = 0.85
/** Stop the power iteration once total rank movement drops below this. */
const CONVERGENCE_TOL = 1e-6
/** Hard cap; convergence on repo-sized graphs needs ~20-40. */
const MAX_ITERATIONS = 100

/**
 * Personalized PageRank over the import graph: nodes are files, an edge
 * A → B means A imports B, so rank flows toward heavily-imported hubs — and
 * a hub that other hubs themselves import accumulates more than a merely
 * popular leaf, which flat in-degree counting cannot see.
 *
 * Teleport uses each file's density share instead of a uniform vector, so
 * sparsely-linked repos keep their 0.2.x ordering (with no edges the fixed
 * point IS the normalized density vector). Returns L1-normalized importance
 * mass per file.
 */
function referencePageRank(files: IndexedFile[], density: Map<string, number>): Map<string, number> {
  const nodes = files.filter((f) => density.has(f.path)).map((f) => f.path)
  const n = nodes.length
  if (n === 0) return new Map()
  if (n === 1) return new Map([[nodes[0]!, 1]])

  const totalDensity = nodes.reduce((sum, p) => sum + (density.get(p) ?? 0), 0)
  const teleport = nodes.map((p) => (density.get(p) ?? 0) / totalDensity)

  const fileSet = new Set(nodes)
  const out = new Map<string, Set<string>>()
  for (const file of files) {
    if (!fileSet.has(file.path)) continue
    const targets = out.get(file.path) ?? new Set<string>()
    for (const spec of file.imports ?? []) {
      const target = resolveImport(spec, file.path, fileSet)
      if (target && target !== file.path) targets.add(target)
    }
    out.set(file.path, targets)
  }

  const incoming = new Map<string, Array<[fromIdx: number, weight: number]>>()
  for (const [from, targets] of out) {
    if (targets.size === 0) continue
    const weight = 1 / targets.size
    const fromIdx = nodes.indexOf(from)
    for (const target of targets) {
      const list = incoming.get(target) ?? []
      list.push([fromIdx, weight])
      incoming.set(target, list)
    }
  }

  let rank = teleport.slice()
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let danglingMass = 0
    for (let i = 0; i < n; i++) {
      if (!out.get(nodes[i]!)?.size) danglingMass += rank[i]!
    }
    const next = new Array<number>(n)
    let delta = 0
    for (let i = 0; i < n; i++) {
      let flow = 0
      for (const [fromIdx, weight] of incoming.get(nodes[i]!) ?? []) {
        flow += rank[fromIdx]! * weight
      }
      next[i] = (1 - DAMPING) * teleport[i]! + DAMPING * (flow + danglingMass * teleport[i]!)
      delta += Math.abs(next[i]! - rank[i]!)
    }
    rank = next
    if (delta < CONVERGENCE_TOL) break
  }

  const result = new Map<string, number>()
  for (let i = 0; i < n; i++) result.set(nodes[i]!, rank[i]!)
  return result
}

/**
 * Resolve a raw import specifier against the indexed file set; returns the
 * repo-relative target path or null. Relative specifiers resolve against the
 * importing file; absolute ones against the repo root — with a suffix
 * fallback so Go module paths and Java package names match their in-repo
 * location without reading go.mod / package-info.
 */
export function resolveImport(spec: string, fromPath: string, fileSet: Set<string>): string | null {
  if (!spec) return null
  if (spec.startsWith('./') || spec.startsWith('../')) {
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), spec))
    return candidateFor(base, fileSet)
  }
  const segments = spec.split('/').filter(Boolean)
  for (let skip = 0; skip < segments.length; skip++) {
    const hit = candidateFor(segments.slice(skip).join('/'), fileSet)
    if (hit) return hit
  }
  return null
}

/** Extension and index-file candidates for a specifier base path. */
function candidateFor(base: string, fileSet: Set<string>): string | null {
  for (const ext of SUPPORTED_EXTS) {
    if (fileSet.has(`${base}${ext}`)) return `${base}${ext}`
  }
  for (const ext of SUPPORTED_EXTS) {
    if (fileSet.has(`${base}/index${ext}`)) return `${base}/index${ext}`
    if (fileSet.has(`${base}/__init__${ext}`)) return `${base}/__init__${ext}`
  }
  return null
}

/** Render the ranked map as markdown, hard-truncated to maxChars. */
export function renderRepoMap(entries: RepoMapEntry[], options: RepoMapOptions = {}): string {
  const maxChars = options.maxChars ?? 3200
  const lines: string[] = ['# repo map']
  let totalSymbols = 0
  for (const e of entries) {
    totalSymbols += e.symbols.length
    lines.push(`## ${e.path} (${e.symbols.length})`)
    for (const s of e.symbols) {
      const label = s.signature || s.name
      lines.push(`  ${s.kind} ${label} :${s.line}`)
    }
  }
  let text = lines.join('\n')
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n… truncated`
  }
  return totalSymbols > 0 ? text : ''
}