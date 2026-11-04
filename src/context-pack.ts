import { buildReferenceGraph } from './refgraph.js'
import type { ResolutionLabel } from './refgraph.js'
import type { RepoIndex, SymbolInfo } from './types.js'
import type { TaskContextResult } from './context.js'
import { contextTerms } from './context-terms.js'
import { resolveImport } from './repomap.js'
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
    if (item.code !== undefined) {
      if (item.signature) rows.push(`Declaration: ${item.signature}`)
      rows.push(`Source (${item.mode}):\n${item.code}`)
    }
    else if (item.mode === 'signature') rows.push(`Signature only: ${item.signature || '(source unavailable within budget)'}`)
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
  index: RepoIndex, context: Omit<TaskContextResult, 'budget' | 'pack'>, budgetChars: number, maxFiles = 12,
): Promise<ContextPack> {
  const read = sourceReader(index)
  const graph = buildReferenceGraph(index)
  const candidates: Array<{ variants: ContextPackItem[]; priority: number }> = []
  const seen = new Set<string>()
  const gaps: string[] = ['test candidates are static leads, not verified coverage', ...context.warnings]
  const unavailable = new Set<string>()
  const queryTerms = new Set(context.route.queries.flatMap(contextTerms))
  const primaryFiles = new Set(context.primarySymbols.map(seed => seed.symbol.file))
  const fileSet = new Set(index.files.map(file => file.path))
  const source = async (symbol: SymbolInfo, kind: ContextPackItem['kind'], reason: string,
    extra: Partial<ContextPackItem> = {}, focus?: number, priority = 50): Promise<void> => {
    const side = extra.side ?? 'current'
    const key = `${side}:${extra.ref ?? ''}:${kind}:${symbol.file}:${symbol.line}:${symbol.name}`
    if (seen.has(key)) return
    seen.add(key)
    const lines = await read(symbol.file, side, extra.ref)
    if (!lines) unavailable.add(`${side}:${symbol.file}`)
    if (side === 'current' && (focus === undefined || focus <= symbol.line + 5) && lines && (symbol.kind === 'function' || symbol.kind === 'method')) {
      // Prefer a task-relevant call inside a long declaration over its header.
      // This chooses an excerpt location; it adds no graph relationship.
      const calls = index.files.find(file => file.path === symbol.file)?.calls ?? []
      const relevant = calls.filter(call => call.line > symbol.line && call.line <= symbol.endLine)
        .map(call => {
          const terms = contextTerms(call.name).filter(term => queryTerms.has(term)).length
          return { line: call.line, terms, score: terms * 4 +
            (context.primarySymbols.some(seed => seed.symbol.name === call.name) ? 3 : 0) +
            (/\b(?:if|return|while)\b/.test(lines[call.line - 1]) ? 2 : 0) }
        })
        .filter(call => call.terms > 0).sort((a, b) => b.score - a.score || a.line - b.line)
      focus = relevant[0]?.line ?? focus
    }
    candidates.push({ priority, variants: excerptVariants(lines, symbol, side, extra.ref, focus).map(excerpt => ({
      ...excerpt, ...(symbol.id === '' && excerpt.mode === 'complete' ? { mode: 'window' as const } : {}),
      kind, name: symbol.name, reason, ...extra,
    })) })
  }
  for (const [rank, primary] of context.primarySymbols.entries()) {
    const changed = context.changeContext?.changed.find(row => row.side === 'current' && row.symbol.id === primary.symbol.id)
    await source(primary.symbol, 'primary', primary.reason, changed ? { change: changed.change } : {}, changed?.focusLine, rank < 4 ? 100 : 45)
  }
  for (const changed of context.changeContext?.changed ?? []) {
    if (changed.side === 'current' && context.primarySymbols.some(seed => seed.symbol.id === changed.symbol.id)) continue
    await source(changed.symbol, 'change', 'declaration intersects Git change', {
      side: changed.side, ...(changed.side === 'base' ? { ref: context.changeContext!.baseRef } : {}), change: changed.change,
    }, changed.focusLine, changed.side === 'current' ? 80 : 40)
  }
  const stem = (file: string): string => file.split('/').at(-1)!.replace(/\.(?:spec|test)(?=\.)/i, '').replace(/\.[^.]+$/, '')
  const seedStems = new Set([...primaryFiles].map(stem))
  const sortedTests = [...context.testEvidence].sort((a, b) => Number(seedStems.has(stem(b.file))) - Number(seedStems.has(stem(a.file))))
  for (const [rank, test] of sortedTests.entries()) {
    const file = index.files.find(row => row.path === test.file)!
    const seedNames = new Set(context.primarySymbols.map(seed => seed.symbol.name))
    for (const imported of file.importDetails ?? []) if (primaryFiles.has(resolveImport(imported.specifier, file.path, fileSet) ?? '')) {
      for (const binding of imported.bindings) seedNames.add(binding.local)
    }
    const call = file.calls?.find(call => seedNames.has(call.name))
    const lines = await read(file.path, 'current')
    const symbol = file.symbols.find(symbol => call && symbol.line <= call.line && symbol.endLine >= call.line)
    const changedTest = context.changeContext?.changed.some(row => row.side === 'current' && row.symbol.file === test.file)
    const reason = test.reason === 'imports-changed-file' ? 'test imports primary seed file' :
      test.reason === 'changed-test' ? (changedTest ? 'test declaration intersects Git change' : 'primary seed is a test file') : test.reason
    await source(symbol ?? { id: '', name: test.file, file: test.file, line: Math.max(1, (call?.line ?? 1) - 3),
      endLine: Math.min(lines?.length ?? 1, (call?.line ?? 1) + 5), signature: '', scope: [], ordinal: 1, kind: 'function', exported: false },
      'test', `candidate test (not verified coverage): ${reason}`,
      { resolution: test.resolution, provenance: test.reason === 'changed-test' && !changedTest ? 'primary seed file; not Git change evidence' : test.reason }, call?.line, rank < 2 ? 60 : 30)
  }
  for (const primary of context.primarySymbols.slice(0, 4)) {
    for (const direction of ['caller', 'callee'] as const) {
      const edges = direction === 'caller' ? graph.incoming.get(primary.symbol.id) : graph.outgoing.get(primary.symbol.id)
      const strongEdges = (edges ?? []).filter(edge => edge.resolution !== 'name-only')
        .sort((a, b) => a.resolution.localeCompare(b.resolution) || a.callSite.file.localeCompare(b.callSite.file) || a.callSite.line - b.callSite.line)
      for (const edge of strongEdges.slice(0, 4)) {
        const symbol = graph.symbolsById.get(direction === 'caller' ? edge.sourceId ?? '' : edge.targetId)
        if (symbol && !context.primarySymbols.some(seed => seed.symbol.id === symbol.id)) {
          await source(symbol, direction, `direct ${direction} of ${primary.symbol.name}`,
            { resolution: edge.resolution, provenance: edge.provenance }, direction === 'caller' ? edge.callSite.line : symbol.line, 75)
        }
      }
    }
    const file = index.files.find(file => file.path === primary.symbol.file)!
    const lines = await read(file.path, 'current')
    const body = lines?.slice(primary.symbol.line - 1, primary.symbol.endLine).join('\n') ?? primary.symbol.signature
    const relevantImports = (file.importDetails ?? []).filter(imported => imported.bindings.some(binding => {
      const escaped = binding.local.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}(?=$|[^A-Za-z0-9_$])`).test(body)
    }))
    for (const imported of relevantImports.slice(0, 3)) {
      const offset = lines?.slice(imported.line - 1, imported.line + 11).findIndex(line => line.includes(imported.specifier)) ?? -1
      const endLine = offset < 0 ? imported.line : imported.line + offset
      await source({ ...primary.symbol, ...(offset < 0 ? { id: '' } : {}), name: imported.specifier,
        line: imported.line, endLine, signature: '' },
        'import', `import binding referenced in primary source ${primary.symbol.file}`, { resolution: 'import-scoped', provenance: 'import statement' }, undefined, 35)
    }
  }
  // Reuse the already bounded impact walk. A strong immediate hop can justify
  // reading a caller declaration even when an earlier hop weakens the path;
  // retain that weakest path label rather than claiming a verified call chain.
  const mentioned = (file: string): boolean => context.route.mentionedFiles.some(path =>
    file.toLowerCase() === path.toLowerCase() || file.toLowerCase().endsWith(`/${path.toLowerCase()}`))
  const isTest = (file: string): boolean => /(^|\/)(tests?|__tests__)(\/|$)|\.(?:spec|test)\./i.test(file)
  const impactSources = (context.changeContext?.impact ?? []).filter(row => row.via.resolution !== 'name-only')
    .sort((a, b) => Number(mentioned(b.symbol.file)) - Number(mentioned(a.symbol.file)) ||
      Number(isTest(a.symbol.file)) - Number(isTest(b.symbol.file)) || a.depth - b.depth)
  for (const row of impactSources.slice(0, 4)) {
    if (!context.primarySymbols.some(seed => seed.symbol.id === row.symbol.id)) {
      await source(row.symbol, 'caller', `candidate transitive caller at depth ${row.depth}; weakest path: ${row.resolution}`, {
        resolution: row.resolution, provenance: row.via.reason,
      }, row.via.callSite.line, 70)
    }
  }
  for (const relation of context.relationships) candidates.push({ priority: 20, variants: [{
    kind: 'relationship', text: relation.text, reason: 'bounded primary graph neighborhood',
    resolution: relation.resolution, provenance: relation.provenance,
  }] })
  // Architecture fallback is explicitly a file lead; never dump whole files.
  if (!context.primarySymbols.length) for (const file of context.relevantFiles.slice(0, 4)) {
    candidates.push({ priority: 10, variants: [{ kind: 'file', file: file.path, reason: file.reason }] })
  }
  if (!context.primarySymbols.length) gaps.push('no strong primary symbol; specify a symbol, path, or failing behavior')
  if (!context.testEvidence.length) gaps.push('no related indexed test found')
  gaps.push(...context.warnings)
  const pack: ContextPack = {
    version: 1, root: index.root, task: context.task.slice(0, 120), route: context.route.kind,
    items: [], gaps: context.warnings.some(warning => warning.startsWith('index incomplete:'))
      ? ['index incomplete; inspect code_index'] : ['budget omitted some evidence'],
    budget: { budgetChars, usedChars: 0, packChars: 0, truncated: context.task.length > 120 },
  }
  const fits = (): boolean => { account(pack); return Math.max(pack.budget.usedChars, pack.budget.packChars) <= budgetChars }
  if (!fits()) { pack.task = ''; fits() }
  if (!fits()) { pack.gaps = pack.gaps.filter(gap => gap.startsWith('index incomplete')); fits() }
  if (!fits()) throw new Error('budget too small for repository identity')
  for (const { variants } of candidates.sort((a, b) => b.priority - a.priority)) {
    let added = false
    for (const candidate of variants) {
      // Many broad matches must leave room for source relations and tests.
      // This caps an individual excerpt, not the final text/DTO hard budget.
      if (context.primarySymbols.length > 4 && candidate.code !== undefined &&
        JSON.stringify(candidate).length > Math.max(600, Math.floor(budgetChars / 8))) continue
      const fragments = candidate.code !== undefined
        ? subtractExcerpt(candidate as SourceExcerpt, pack.items.filter(item => item.code !== undefined) as SourceExcerpt[])
          .map(fragment => ({ ...candidate, ...fragment }))
        : [candidate]
      if (!fragments.length) continue // retain reason/role via signature fallback
      pack.items.push(...fragments)
      const fileCount = new Set(pack.items.flatMap(item => item.file ? [item.file] : [])).size
      if (fits() && fileCount <= maxFiles) { added = true; if (candidate.mode === 'signature') pack.budget.truncated = true; break }
      pack.items.splice(pack.items.length - fragments.length)
    }
    if (!added) pack.budget.truncated = true
  }
  if (!pack.budget.truncated) pack.gaps = pack.gaps.filter(gap => gap.startsWith('index incomplete'))
  for (const item of pack.items) if (item.file && unavailable.has(`${item.side}:${item.file}`)) {
    gaps.push(`source unavailable or changed after indexing: ${item.file} (${item.side})`)
  }
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
