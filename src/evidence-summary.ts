import type { RepoIndex, SymbolInfo } from './types.js'
import type { ReferenceGraph, ResolutionLabel } from './refgraph.js'

export interface EvidenceLocation { file: string; line: number; name?: string }
export interface EvidenceGap {
  kind: 'not-found' | 'unavailable' | 'budget' | 'index-incomplete' | 'selection-limit'
  code: string
  source: string
  file?: string
  side?: 'current' | 'base'
}

/** Counts describe indexed files and selected evidence, never runtime completeness. */
export interface EvidenceSummary {
  scope: 'indexed-static-only'
  basis: 'context-pack' | 'change-analysis'
  index: {
    parsed: number; partial: number; failed: number; unknown: number
    diagnostics?: Array<{ file: string; status: 'partial' | 'failed'; line?: number; reason?: string }>
    diagnosticsOmitted?: number
  }
  relationships: Record<ResolutionLabel, number>
  callers?: { checkedSymbols: number; zero: EvidenceLocation[]; zeroOmitted?: number }
  unresolved?: { count: number; sites: EvidenceLocation[]; sitesOmitted?: number }
  tests: { candidates: number; verification: 'not-run' }
  gaps?: EvidenceGap[]
}

export function summarizeEvidence(index: RepoIndex, options: {
  basis?: EvidenceSummary['basis']
  graph?: ReferenceGraph
  seeds?: readonly SymbolInfo[]
  resolutions: readonly ResolutionLabel[]
  testFiles: readonly string[]
  gaps?: readonly EvidenceGap[]
}): EvidenceSummary {
  const status = { parsed: 0, partial: 0, failed: 0, unknown: 0 }
  const diagnostics: NonNullable<EvidenceSummary['index']['diagnostics']> = []
  for (const file of index.files) {
    const diagnostic = file.diagnostic
    status[diagnostic?.status ?? 'unknown']++
    if (diagnostic && diagnostic.status !== 'parsed') diagnostics.push({ file: file.path,
      status: diagnostic.status, ...(diagnostic.issues[0] ? { line: diagnostic.issues[0].line } : {}),
      ...(diagnostic.reason ? { reason: diagnostic.reason } : {}) })
  }
  diagnostics.sort((a, b) => a.file.localeCompare(b.file))
  const relationships = { exact: 0, 'import-scoped': 0, 'name-only': 0 }
  for (const resolution of options.resolutions) relationships[resolution]++
  const gaps = [...(options.gaps ?? [])]
  if (status.partial || status.failed) gaps.push({ kind: 'index-incomplete', code: 'parse-diagnostics', source: 'indexed-file.diagnostic' })
  if (status.unknown) gaps.push({ kind: 'unavailable', code: 'parse-status-unknown', source: 'indexed-file.diagnostic' })
  const result: EvidenceSummary = {
    scope: 'indexed-static-only', basis: options.basis ?? 'context-pack', index: { ...status,
      ...(diagnostics.length ? { diagnostics: diagnostics.slice(0, 3) } : {}),
      ...(diagnostics.length > 3 ? { diagnosticsOmitted: diagnostics.length - 3 } : {}) },
    relationships, tests: { candidates: new Set(options.testFiles).size, verification: 'not-run' },
  }
  if (options.graph && options.seeds?.length) {
    const graph = options.graph
    const seeds = [...new Map(options.seeds.map(seed => [seed.id, seed])).values()]
    const zero = seeds.filter(seed => !(graph.incoming.get(seed.id)?.length))
      .map(seed => ({ file: seed.file, line: seed.line, name: seed.name }))
    result.callers = { checkedSymbols: seeds.length, zero: zero.slice(0, 3),
      ...(zero.length > 3 ? { zeroOmitted: zero.length - 3 } : {}) }
    const unresolved: EvidenceLocation[] = []
    for (const seed of seeds) {
      const edges = graph.outgoing.get(seed.id) ?? []
      for (const call of index.files.find(file => file.path === seed.file)?.calls ?? []) {
        if (call.fromId !== seed.id) continue
        if (!edges.some(edge => edge.callSite.file === seed.file && edge.callSite.line === call.line && edge.name === call.name)) {
          unresolved.push({ file: seed.file, line: call.line, name: call.name })
        }
      }
    }
    if (unresolved.length) {
      result.unresolved = { count: unresolved.length, sites: unresolved.slice(0, 3),
        ...(unresolved.length > 3 ? { sitesOmitted: unresolved.length - 3 } : {}) }
      gaps.push({ kind: 'not-found', code: 'unresolved-call-targets', source: 'indexed-call-sites' })
    }
  }
  if (gaps.length) result.gaps = [...new Map(gaps.map(gap => [JSON.stringify(gap), gap])).values()]
  return result
}

export function renderEvidenceSummary(summary: EvidenceSummary): string {
  const i = summary.index
  const r = summary.relationships
  const lines = [`Evidence (indexed static scope; unscanned files not assessed):`,
    `Index: ${i.parsed} parsed, ${i.partial} partial, ${i.failed} failed, ${i.unknown} unknown.`,
    `Selected relationship items: exact ${r.exact}, import-scoped ${r['import-scoped']}, name-only ${r['name-only']}.`,
    `Tests: ${summary.tests.candidates} candidate(s), not run; not verified coverage.`]
  for (const d of i.diagnostics ?? []) lines.push(`Parse: ${d.file}${d.line ? `:${d.line}` : ''} ${d.status}${d.reason ? ` (${d.reason})` : ''}.`)
  if (i.diagnosticsOmitted) lines.push(`More parse diagnostics: ${i.diagnosticsOmitted}; inspect code_index.`)
  if (summary.callers?.zero.length) lines.push(`0 callers for ${summary.callers.zero.map(s => `${s.name} (${s.file}:${s.line})`).join(', ')}: none found in current index/static resolution; not proof of no callers.`)
  if (summary.callers?.zeroOmitted) lines.push(`0 callers for ${summary.callers.zeroOmitted} other checked declaration(s) in indexed static scope only; not proof of no callers. Locations omitted for budget.`)
  if (summary.unresolved) lines.push(`Unresolved call sites: ${summary.unresolved.count}; target unknown, external not established.`)
  if (summary.gaps?.length) lines.push(`Evidence gaps: ${[...new Set(summary.gaps.map(g => `${g.kind}/${g.code}`))].join(', ')}.`)
  return lines.join('\n')
}

/** Drop locations, not the index boundary or evidence levels, when space is tight. */
export function compactEvidence(summary: EvidenceSummary): EvidenceSummary {
  const { diagnostics, diagnosticsOmitted, ...counts } = summary.index
  const omitted = (diagnostics?.length ?? 0) + (diagnosticsOmitted ?? 0)
  return { ...summary, index: { ...counts, ...(omitted ? { diagnosticsOmitted: omitted } : {}) },
    ...(summary.callers ? { callers: { checkedSymbols: summary.callers.checkedSymbols, zero: [],
      ...(summary.callers.zero.length || summary.callers.zeroOmitted ? { zeroOmitted: summary.callers.zero.length + (summary.callers.zeroOmitted ?? 0) } : {}) } } : {}),
    ...(summary.unresolved ? { unresolved: { count: summary.unresolved.count, sites: [], sitesOmitted: summary.unresolved.count } } : {}) }
}
