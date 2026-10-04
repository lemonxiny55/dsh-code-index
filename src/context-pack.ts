import { buildReferenceGraph } from './refgraph.js'
import type { ResolutionLabel } from './refgraph.js'
import type { RepoIndex, SymbolInfo } from './types.js'
import type { TaskContextResult } from './context.js'
import { excerptVariants, sourceReader, subtractExcerpt, type SourceExcerpt } from './source-excerpts.js'

export interface ContextPackItem extends Partial<SourceExcerpt> {
  kind: 'primary' | 'caller' | 'callee' | 'import' | 'test' | 'change' | 'file' | 'relationship'
  name?: string
  reason: string
  resolution?: ResolutionLabel
  provenance?: string
  change?: string
  text?: string
}

/** The only final presentation DTO. Items here have already passed selection. */
export interface ContextPack {
  version: 1
  root: string
  task: string
  route: TaskContextResult['route']['kind']
  items: ContextPackItem[]
  gaps: string[]
  budget: { budgetChars: number; usedChars: number; packChars: number; truncated: boolean }
}

export function renderContextPack(pack: ContextPack): string {
  const rows = [`Task context — ${pack.route}`, `Repo/worktree: ${pack.root}`, `Task: ${pack.task}`]
  for (const item of pack.items) {
    const location = item.file ? ` ${item.file}:${item.startLine ?? 1}-${item.endLine ?? item.startLine ?? 1}` : ''
    rows.push(`\n${item.kind}: ${item.name ?? item.text ?? ''}${location}${item.side ? ` [${item.side}${item.ref ? ` @${item.ref}` : ''}]` : ''}`)
    rows.push(`Reason: ${item.reason}`)
    if (item.change) rows.push(`Change: ${item.change}`)
    if (item.resolution) rows.push(`Relationship provenance: ${item.resolution}${item.provenance ? `; ${item.provenance}` : ''}`)
    if (item.code !== undefined) rows.push(`Source (${item.mode}):\n${item.code}`)
    else if (item.signature) rows.push(`Signature only: ${item.signature}`)
  }
  if (pack.gaps.length) rows.push(`\nGaps: ${pack.gaps.join('; ')}`)
  rows.push(`Budget: ${pack.budget.usedChars} / ${pack.budget.budgetChars} chars${pack.budget.truncated ? ' (trimmed low-priority context)' : ''}`)
  return rows.join('\n')
}

function account(pack: ContextPack): void {
  for (let i = 0; i < 8; i++) {
    const textChars = renderContextPack(pack).length
    const packChars = JSON.stringify(pack).length
    if (pack.budget.usedChars === textChars && pack.budget.packChars === packChars) break
    pack.budget.usedChars = textChars
    pack.budget.packChars = packChars
  }
}

export async function selectContextPack(
  index: RepoIndex, context: Omit<TaskContextResult, 'budget' | 'pack'>, budgetChars: number,
): Promise<ContextPack> {
  const read = sourceReader(index)
  const graph = buildReferenceGraph(index)
  const candidates: ContextPackItem[][] = []
  const seen = new Set<string>()
  const gaps: string[] = []
  const source = async (symbol: SymbolInfo, kind: ContextPackItem['kind'], reason: string,
    extra: Partial<ContextPackItem> = {}, focus?: number): Promise<void> => {
    const side = extra.side ?? 'current'
    const key = `${side}:${extra.ref ?? ''}:${kind}:${symbol.file}:${symbol.line}:${symbol.name}`
    if (seen.has(key)) return
    seen.add(key)
    const lines = await read(symbol.file, side, extra.ref)
    if (!lines) gaps.push(`source unavailable or changed after indexing: ${symbol.file} (${side})`)
    candidates.push(excerptVariants(lines, symbol, side, extra.ref, focus).map(excerpt => ({
      ...excerpt, kind, name: symbol.name, reason, ...extra,
    })))
  }
  for (const primary of context.primarySymbols) {
    const changed = context.changeContext?.changed.find(row => row.side === 'current' && row.symbol.id === primary.symbol.id)
    await source(primary.symbol, 'primary', primary.reason, changed ? { change: changed.change } : {})
  }
  for (const changed of context.changeContext?.changed ?? []) {
    if (changed.side === 'current' && context.primarySymbols.some(seed => seed.symbol.id === changed.symbol.id)) continue
    await source(changed.symbol, 'change', 'declaration intersects Git change', {
      side: changed.side, ...(changed.side === 'base' ? { ref: context.changeContext!.baseRef } : {}), change: changed.change,
    })
  }
  for (const test of context.testEvidence) {
    const file = index.files.find(row => row.path === test.file)!
    const seedNames = new Set(context.primarySymbols.map(seed => seed.symbol.name))
    const call = file.calls?.find(call => seedNames.has(call.name))
    const symbol = file.symbols.find(symbol => call && symbol.line <= call.line && symbol.endLine >= call.line)
    await source(symbol ?? { id: '', name: test.file, file: test.file, line: Math.max(1, (call?.line ?? 1) - 1),
      endLine: call?.line ?? 1, signature: '', scope: [], ordinal: 1, kind: 'function', exported: false },
      'test', test.reason === 'imports-changed-file' ? 'test imports primary seed file' : test.reason,
      { resolution: test.resolution, provenance: test.reason }, call?.line)
  }
  for (const primary of context.primarySymbols.slice(0, 4)) {
    for (const direction of ['caller', 'callee'] as const) {
      const edges = direction === 'caller' ? graph.incoming.get(primary.symbol.id) : graph.outgoing.get(primary.symbol.id)
      for (const edge of (edges ?? []).slice(0, 4)) {
        if (edge.resolution === 'name-only') continue
        const symbol = graph.symbolsById.get(direction === 'caller' ? edge.sourceId ?? '' : edge.targetId)
        if (symbol && !context.primarySymbols.some(seed => seed.symbol.id === symbol.id)) {
          await source(symbol, direction, `direct ${direction} of ${primary.symbol.name}`,
            { resolution: edge.resolution, provenance: edge.provenance }, direction === 'caller' ? edge.callSite.line : symbol.line)
        }
      }
    }
    const file = index.files.find(file => file.path === primary.symbol.file)!
    for (const imported of (file.importDetails ?? []).slice(0, 3)) {
      await source({ ...primary.symbol, name: imported.specifier, line: imported.line, endLine: imported.line, signature: '' },
        'import', `import in primary file ${primary.symbol.file}`, { resolution: 'import-scoped', provenance: 'import statement' })
    }
  }
  for (const relation of context.relationships) candidates.push([{
    kind: 'relationship', text: relation.text, reason: 'bounded primary graph neighborhood',
    resolution: relation.resolution, provenance: relation.provenance,
  }])
  // Architecture fallback is explicitly a file lead; never dump whole files.
  if (!context.primarySymbols.length) for (const file of context.relevantFiles.slice(0, 4)) {
    candidates.push([{ kind: 'file', file: file.path, reason: file.reason }])
  }
  if (!context.primarySymbols.length) gaps.push('no strong primary symbol; specify a symbol, path, or failing behavior')
  if (!context.testEvidence.length) gaps.push('no related indexed test found')
  gaps.push(...context.warnings)
  const pack: ContextPack = {
    version: 1, root: index.root, task: context.task.slice(0, 120), route: context.route.kind,
    items: [], gaps: ['budget omitted some evidence'],
    budget: { budgetChars, usedChars: 0, packChars: 0, truncated: context.task.length > 120 },
  }
  const fits = (): boolean => { account(pack); return Math.max(pack.budget.usedChars, pack.budget.packChars) <= budgetChars }
  if (!fits()) { pack.task = ''; pack.gaps = []; fits() }
  for (const variants of candidates) {
    let added = false
    for (const candidate of variants) {
      const fragments = candidate.code !== undefined
        ? subtractExcerpt(candidate as SourceExcerpt, pack.items.filter(item => item.code !== undefined) as SourceExcerpt[])
          .map(fragment => ({ ...candidate, ...fragment }))
        : [candidate]
      if (!fragments.length) { added = true; break }
      pack.items.push(...fragments)
      if (fits()) { added = true; if (candidate.mode === 'signature') pack.budget.truncated = true; break }
      pack.items.splice(pack.items.length - fragments.length)
    }
    if (!added) pack.budget.truncated = true
  }
  if (!pack.budget.truncated) pack.gaps = []
  for (const gap of [...new Set(gaps)].slice(0, 4)) {
    pack.gaps.push(gap.slice(0, 140))
    if (!fits()) pack.gaps.pop()
  }
  account(pack)
  // Tiny budgets/root paths may leave only the header. Never slice code.
  while (Math.max(pack.budget.usedChars, pack.budget.packChars) > budgetChars && pack.items.length) {
    pack.items.pop(); pack.budget.truncated = true; account(pack)
  }
  return pack
}
