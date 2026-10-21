import type { ChangeContextResult, ImpactHop } from './change-context.js'
import type { RepoIndex, SymbolInfo } from './types.js'
import { sourceReader } from './source-excerpts.js'
import { resolveImport } from './repomap.js'
import { XRAY_LIMITS, type ImpactXray, type XrayNode, type XrayEvidence } from './impact-xray-model.js'
export * from './impact-xray-model.js'

/** Presentation of existing analysis. Never resolves new function-call edges. */
export async function buildImpactXray(index: RepoIndex, result: ChangeContextResult): Promise<ImpactXray> {
  const view: ImpactXray = { card: 'impact-xray', version: 2, root: result.root, source: result.source,
    nodes: [], edges: [], tests: [], imports: [], paths: [], unmapped: [], gaps: result.warnings.slice(0, 12), truncated: false,
    bounds: { analysis: { ...result.truncated }, projection: false, totals: { changed: result.changed.length, callers: result.directCallers.length,
      impact: result.impact.length, imports: result.importDependents.length, tests: result.tests.length, paths: result.paths.length, unmapped: result.unmapped.length } } }
  const read = sourceReader(index)
  const files = new Map(index.files.map(f => [f.path, f]))
  const symbols = new Map(index.files.flatMap(f => f.symbols.map(s => [s.id, s] as const)))
  const changedFiles = new Set(result.changed.map(r => r.symbol.file).concat(result.unmapped.map(r => r.file)))
  const impactFiles = new Set([...result.directCallers, ...result.impact].map(r => r.symbol.file))
  const fileSet = new Set([...files.keys(), ...changedFiles])
  const testFiles = new Set(result.tests.map(t => t.file))
  const changed = new Set(result.changed.filter(r => r.side === 'current').map(r => r.symbol.id))
  const depths = new Map([...result.directCallers, ...result.impact].map(r => [r.symbol.id, r.depth]))
  const nodes = new Map<string, XrayNode>()
  const clip = (): void => { view.bounds!.projection = true }
  const evidence = async (file: string, line: number, type: XrayEvidence['type'], side: 'current' | 'base' = 'current'): Promise<XrayEvidence> => {
    const ref = side === 'base' ? result.baseRef : undefined
    const entry: XrayEvidence = { file, line, startLine: Math.max(1, line - 2), side, type, ...(ref ? { ref } : {}) }
    const lines = await read(file, side, ref)
    if (!lines) return { ...entry, gap: 'source-unavailable' }
    if (line < 1 || line > lines.length) return { ...entry, gap: 'line-unavailable' }
    const code = lines.slice(entry.startLine - 1, line + 3).join('\n')
    return code.length <= XRAY_LIMITS.evidenceChars ? { ...entry, code } : { ...entry, gap: 'source-budget' }
  }
  const addNode = async (s: SymbolInfo, reason: string, side: 'current' | 'base' = 'current', extra: Partial<XrayNode> = {}): Promise<string | null> => {
    const id = `${side}:${s.id}`
    if (nodes.has(id)) return id
    if (view.nodes.length >= XRAY_LIMITS.nodes) { clip(); return null }
    const isChanged = side === 'base' || changed.has(s.id)
    const node: XrayNode = { id, name: s.name, kind: s.kind, file: s.file, line: s.line, changed: isChanged,
      category: isChanged ? 'change' : testFiles.has(s.file) ? 'test' : (depths.get(s.id) ?? 1) > 1 ? 'impact' : 'caller',
      depth: isChanged ? 0 : depths.get(s.id) ?? 1, reason, evidence: await evidence(s.file, s.line, 'declaration', side), ...extra }
    nodes.set(id, node); view.nodes.push(node); return id
  }
  for (const row of result.changed.slice(0, 12)) await addNode(row.symbol,
    result.source === 'files' || result.source === 'symbols' ? 'explicit-selection' : 'diff-mapping', row.side, { change: row.change })
  if (result.changed.length > 12) clip()
  const hopKeys = new Map<string, string>()
  const keyOf = (hop: ImpactHop): string => JSON.stringify([hop.fromId, hop.toId, hop.callSite, hop.resolution, hop.reason])
  const hops = [...result.directCallers, ...result.impact].map(r => r.via).concat(result.paths.flatMap(r => r.hops))
  for (const hop of hops) {
    const key = keyOf(hop)
    if (hopKeys.has(key)) continue
    if (view.edges.length >= 32) { clip(); continue }
    const from = hop.fromId === null ? undefined : symbols.get(hop.fromId), to = symbols.get(hop.toId)
    if (!from || !to) { view.gaps.push('endpoint-unavailable'); continue }
    const missing = new Set([from.id, to.id].filter(id => !nodes.has(`current:${id}`))).size
    if (view.nodes.length + missing > 24) { clip(); continue }
    const fromId = await addNode(from, hop.reason), toId = await addNode(to, hop.reason)
    if (fromId && toId) {
      const id = `call:${view.edges.length}`
      view.edges.push({ id, from: fromId, to: toId, kind: 'call', resolution: hop.resolution, reason: hop.reason,
        evidence: await evidence(hop.callSite.file, hop.callSite.line, 'call-site') })
      hopKeys.set(key, id)
    }
  }
  for (const p of result.paths.slice(0, XRAY_LIMITS.paths)) {
    const edgeIds = p.hops.map(h => hopKeys.get(keyOf(h))).filter((id): id is string => id !== undefined)
    view.paths!.push({ id: `path:${view.paths!.length}`, from: p.entry.name, to: p.changed.name, edgeIds,
      resolution: p.resolution, omitted: edgeIds.length !== p.hops.length })
  }
  if (result.paths.length > XRAY_LIMITS.paths) clip()
  const fileNode = async (file: string, line = 1, reason = 'module', supplied?: XrayEvidence): Promise<string | null> => {
    const side = files.has(file) ? 'current' : 'base'
    const id = `file:${side}:${file}`
    if (nodes.has(id)) return id
    if (view.nodes.length >= XRAY_LIMITS.nodes) { clip(); return null }
    const n: XrayNode = { id, name: file, kind: 'module', file, line, changed: changedFiles.has(file),
      category: testFiles.has(file) ? 'test' : 'module', reason, evidence: supplied ?? await evidence(file, line, 'declaration', side) }
    nodes.set(id, n); view.nodes.push(n); return id
  }
  for (const row of result.importDependents.slice(0, 8)) {
    const site = files.get(row.file)?.importDetails?.find(i => i.specifier === row.specifier)
    const from = await fileNode(row.file, site?.line ?? 1, 'import-dependent')
    const to = await fileNode(row.changedFile, 1, 'changed-module')
    let edgeId: string | undefined
    if (site && from && to && view.edges.length < XRAY_LIMITS.edges) {
      edgeId = `import:${view.edges.length}`
      view.edges.push({ id: edgeId, from, to, kind: 'import', resolution: row.resolution, reason: 'imports-changed-file',
        evidence: await evidence(row.file, site.line, 'import-site') })
    } else view.gaps.push('import-site-unavailable')
    view.imports.push({ ...row, ...(edgeId ? { edgeId } : {}) })
  }
  for (const row of result.tests.slice(0, 8)) {
    const file = files.get(row.file)
    const targets = row.reason === 'imports-changed-file' ? changedFiles : row.reason === 'imports-impact-file' ? impactFiles : new Set<string>()
    const site = file?.importDetails?.find(i => { const target = resolveImport(i.specifier, row.file, fileSet); return target !== null && targets.has(target) })
    const call = row.reason === 'references-symbol-name' ? file?.calls?.find(c => result.changed.some(s => s.symbol.name === c.name)) : undefined
    const line = site?.line ?? call?.line ?? 1
    const e = await evidence(row.file, line, site ? 'import-site' : 'test-lead')
    const nodeId = await fileNode(row.file, line, row.reason, e)
    if (nodeId) { const n = nodes.get(nodeId)!; n.reason = row.reason; n.resolution = row.resolution; n.evidence = e; n.line = line }
    view.tests.push({ ...row, ...(nodeId ? { nodeId } : {}) })
  }
  if (result.importDependents.length > 8 || result.tests.length > 8) clip()
  for (const row of result.unmapped.slice(0, 8)) view.unmapped!.push({ ...row, ranges: row.ranges.slice(0, 16),
    evidence: await evidence(row.file, row.ranges[0]?.startLine ?? 1, 'unmapped-change', row.side) })
  if (result.unmapped.length > 8 || result.unmapped.some(r => r.ranges.length > 16)) clip()
  view.gaps = [...new Set(view.gaps)].slice(0, 20)
  view.truncated = view.bounds!.projection || Object.values(result.truncated).some(Boolean)
  if (Buffer.byteLength(JSON.stringify(view)) > XRAY_LIMITS.metadataBytes) {
    for (const e of [...view.nodes.map(n => n.evidence), ...view.edges.map(e => e.evidence), ...view.unmapped!.map(u => u.evidence)]) {
      delete e.code; e.gap = 'source-budget'
    }
    clip(); view.truncated = true
    if (Buffer.byteLength(JSON.stringify(view)) > XRAY_LIMITS.metadataBytes) return {
      card: 'impact-xray', version: 2, root: '', source: result.source, nodes: [], edges: [], tests: [], imports: [], gaps: ['metadata-budget'], truncated: true,
    }
  }
  return view
}
