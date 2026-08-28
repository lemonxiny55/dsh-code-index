/** Pure search / filter logic over a RepoIndex — unit-testable, no IO. */

import type { RepoIndex, SymbolInfo, SymbolKind } from './types.js'

export interface SymbolFilter {
  query?: string
  file?: string
  kind?: SymbolKind
  exportedOnly?: boolean
}

export interface RankedHit extends SymbolInfo {
  /** 0..1 relevance. 1 = exact name match; lower = fuzzier. */
  score: number
}

function matchScore(name: string, query: string): number {
  const q = query.toLowerCase()
  const n = name.toLowerCase()
  if (n === q) return 1
  if (n.startsWith(q)) return 0.8
  if (n.includes(q)) return 0.5
  if (q.length >= 3 && isSubsequence(q, n)) return 0.3
  return 0
}

/**
 * Every query char appears in the name, in order — 'cfgldr' finds
 * 'configLoader'. Gated to 3+ chars so short queries don't match everything.
 */
function isSubsequence(query: string, name: string): boolean {
  let i = 0
  for (const ch of name) {
    if (ch === query[i]) i++
    if (i === query.length) return true
  }
  return false
}

/** Filter symbols by file/kind/export, then score by name against query (if any). */
export function searchSymbols(
  index: RepoIndex,
  filter: SymbolFilter,
  limit = 50,
): RankedHit[] {
  const q = (filter.query ?? '').trim()
  const filePat = filter.file?.trim().toLowerCase()
  const hits: RankedHit[] = []

  for (const file of index.files) {
    if (filePat && !file.path.toLowerCase().includes(filePat)) continue
    for (const sym of file.symbols) {
      if (filter.kind && sym.kind !== filter.kind) continue
      if (filter.exportedOnly && !sym.exported) continue
      const score = q ? matchScore(sym.name, q) : 0.4
      if (q && score === 0) continue
      hits.push({ ...sym, score })
    }
  }

  // Export boost, then relevance, then stable name order.
  hits.sort((a, b) => {
    const ab =
      Number(b.exported) - Number(a.exported) ||
      b.score - a.score ||
      a.name.localeCompare(b.name) ||
      a.file.localeCompare(b.file)
    return ab
  })
  return hits.slice(0, limit)
}

/** Neat one-line rendering of a hit for terminal/chat output. */
export function renderHit(hit: RankedHit): string {
  const exportMark = hit.exported ? 'export ' : ''
  const sig = hit.signature || hit.name
  const score = hit.score < 1 ? ` [${hit.score.toFixed(2)}]` : ''
  return `${exportMark}${hit.kind} ${sig}${score} — ${hit.file}:${hit.line}`
}