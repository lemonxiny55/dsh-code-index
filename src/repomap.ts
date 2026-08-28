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
  const refs = countReferences(index.files)
  const ranked = index.files
    .filter((f) => f.symbols.length > 0)
    .map((f) => ({
      file: f,
      score: scoreFile(f) + REF_WEIGHT * (refs.get(f.path) ?? 0),
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

/** How much one in-repo import is worth in map score. */
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