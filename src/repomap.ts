/**
 * Bounded, ranked repo map generation — the "aider-style" overview the model
 * can turn to before browsing files. Pure logic, no IO.
 */

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

/** Density-aware file score: weighted symbols minus bloat. */
export function scoreFile(file: IndexedFile): number {
  let score = 0
  for (const sym of file.symbols) {
    score += KIND_WEIGHT[sym.kind] ?? 0.3
    if (sym.exported) score += 0.3
  }
  return score / (1 + file.symbols.length * 0.04)
}

/** Rank files, take the top slice, cap per-file symbols. */
export function rankRepoMap(index: RepoIndex, options: RepoMapOptions = {}): RepoMapEntry[] {
  const topFiles = options.topFiles ?? 24
  const perFile = options.symbolsPerFile ?? 18
  const ranked = index.files
    .filter((f) => f.symbols.length > 0)
    .map((f) => ({ file: f, score: scoreFile(f) }))
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