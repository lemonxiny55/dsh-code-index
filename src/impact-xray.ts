import type { ChangeContextResult, ImpactHop } from './change-context.js'
import type { RepoIndex, SymbolInfo } from './types.js'
import { sourceReader } from './source-excerpts.js'

/** A bounded presentation snapshot, not a second analysis engine. */
export interface XrayEvidence {
  file: string
  line: number
  startLine: number
  side: 'current' | 'base'
  ref?: string
  code?: string
  gap?: string
}
export interface XrayNode {
  id: string
  name: string
  kind: string
  file: string
  line: number
  changed: boolean
  reason: string
  evidence: XrayEvidence
}
export interface XrayEdge {
  id: string
  from: string
  to: string
  resolution: ImpactHop['resolution']
  reason: string
  evidence: XrayEvidence
}
export interface ImpactXray {
  card: 'impact-xray'
  version: 1
  root: string
  source: ChangeContextResult['source']
  nodes: XrayNode[]
  edges: XrayEdge[]
  tests: ChangeContextResult['tests']
  imports: ChangeContextResult['importDependents']
  gaps: string[]
  truncated: boolean
}

export const XRAY_LIMITS = { nodes: 20, edges: 32, evidenceChars: 900, metadataBytes: 64_000 } as const

export async function buildImpactXray(index: RepoIndex, result: ChangeContextResult): Promise<ImpactXray> {
  const view: ImpactXray = { card: 'impact-xray', version: 1, root: result.root, source: result.source,
    nodes: [], edges: [], tests: result.tests.slice(0, 8), imports: result.importDependents.slice(0, 8),
    gaps: result.warnings.slice(0, 12), truncated: Object.values(result.truncated).some(Boolean) }
  const read = sourceReader(index)
  const symbols = new Map(index.files.flatMap(file => file.symbols.map(symbol => [symbol.id, symbol] as const)))
  const nodeById = new Map<string, XrayNode>()
  const changed = new Set(result.changed.filter(row => row.side === 'current').map(row => row.symbol.id))
  const evidence = async (file: string, line: number, side: 'current' | 'base' = 'current'): Promise<XrayEvidence> => {
    const ref = side === 'base' ? result.baseRef : undefined
    const entry: XrayEvidence = { file, line, startLine: Math.max(1, line - 2), side, ...(ref ? { ref } : {}) }
    const lines = await read(file, side, ref)
    if (!lines || line < 1 || line > lines.length) return { ...entry, gap: 'Source unavailable, stale, outside repository, or line missing.' }
    const code = lines.slice(entry.startLine - 1, line + 3).join('\n')
    return code.length <= XRAY_LIMITS.evidenceChars ? { ...entry, code } :
      { ...entry, gap: 'Source window exceeds the evidence budget; no partial line is shown.' }
  }
  const addNode = async (symbol: SymbolInfo, reason: string, side: 'current' | 'base' = 'current'): Promise<string | null> => {
    const id = `${side}:${symbol.id}`
    if (nodeById.has(id)) return id
    if (view.nodes.length >= XRAY_LIMITS.nodes) { view.truncated = true; return null }
    const node: XrayNode = { id, name: symbol.name, kind: symbol.kind, file: symbol.file, line: symbol.line,
      changed: side === 'base' || changed.has(symbol.id), reason, evidence: await evidence(symbol.file, symbol.line, side) }
    nodeById.set(id, node); view.nodes.push(node)
    return id
  }
  for (const row of result.changed) {
    if (view.nodes.length >= XRAY_LIMITS.nodes) { view.truncated = true; break }
    await addNode(row.symbol, `${row.change}; ${result.source === 'files' || result.source === 'symbols' ? 'explicit selection, not a proven edit' : 'Git/diff declaration mapping'}; ${row.side}`, row.side)
  }
  const seen = new Set<string>()
  // Preserve the direction, confidence and call site of each existing hop.
  // Never connect rows just because they are adjacent in the UI.
  const hops = [...result.directCallers, ...result.impact].map(row => row.via)
    .concat(result.paths.flatMap(row => row.hops))
  for (const hop of hops) {
    const key = JSON.stringify([hop.fromId, hop.toId, hop.callSite, hop.resolution, hop.reason])
    if (seen.has(key)) continue
    seen.add(key)
    if (view.edges.length >= XRAY_LIMITS.edges) { view.truncated = true; break }
    const from = hop.fromId === null ? undefined : symbols.get(hop.fromId)
    const to = symbols.get(hop.toId)
    if (!from || !to) { view.gaps.push(`Unrendered hop at ${hop.callSite.file}:${hop.callSite.line}: endpoint unavailable.`); continue }
    // Reserve both endpoints together; do not strand a half-inserted edge.
    const missing = [from, to].filter((symbol, i, all) => all.findIndex(s => s.id === symbol.id) === i && !nodeById.has(`current:${symbol.id}`)).length
    if (view.nodes.length + missing > XRAY_LIMITS.nodes) { view.truncated = true; continue }
    const fromId = await addNode(from, `Caller via ${hop.reason}`)
    const toId = await addNode(to, `Call target via ${hop.reason}`)
    if (fromId && toId) view.edges.push({ id: `edge:${view.edges.length}`, from: fromId, to: toId,
      resolution: hop.resolution, reason: hop.reason, evidence: await evidence(hop.callSite.file, hop.callSite.line) })
  }
  for (const row of result.unmapped.slice(0, 8)) view.gaps.push(`Unmapped ${row.side} ${row.file}: ${row.reason}`)
  if (result.unmapped.length > 8 || result.tests.length > 8 || result.importDependents.length > 8) view.truncated = true
  view.gaps = view.gaps.slice(0, 20)
  if (view.truncated) view.gaps.push('Bounded view: some analysis rows or source evidence are omitted. Absence is not proof of no impact.')
  view.gaps.push('Potential impact only. exact means structurally resolved within this index, not runtime certainty. Test leads are not coverage proof.')
  if (Buffer.byteLength(JSON.stringify(view), 'utf8') > XRAY_LIMITS.metadataBytes) {
    return { card: 'impact-xray', version: 1, root: '', source: result.source, nodes: [], edges: [], tests: [], imports: [],
      gaps: ['Presentation exceeds 64 KB; graph omitted. Use a smaller change selection.'], truncated: true }
  }
  return view
}
