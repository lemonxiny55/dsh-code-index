/** Internal feasibility prototype. No tool registration or production exports. */
import { execFileSync } from 'node:child_process'
import type { RepoIndex } from '../src/types.js'
import type { ChangeContextResult } from '../src/change-context.js'
import { excerptVariants, sourceReader, type SourceExcerpt } from '../src/source-excerpts.js'

interface Brief {
  version: 1
  repository?: { root: string; head: string | null; baseRef: string | null; indexedAt: number }
  summary?: { source: ChangeContextResult['source']; changedSymbols: number }
  changes?: Array<SourceExcerpt & { name: string; change: string }>
  relations?: Array<{ file: string; line: number; name: string; resolution: string; reason: string }>
  tests?: Array<{ file: string; resolution: string; reason: string }>
  verification: 'not-run'
  gaps: string[]
}
export interface ReviewOutput { text: string; brief: Brief }

function render(brief: Brief): string {
  const lines = ['Review Brief — indexed static evidence', 'Candidate tests: not-run; coverage not verified.']
  if (brief.repository) lines.push(`Repo/worktree: ${brief.repository.root}`, `HEAD: ${brief.repository.head ?? 'unavailable'}; base: ${brief.repository.baseRef ?? 'not-applicable'}`)
  if (brief.summary) lines.push(`Selection: ${brief.summary.source}; changed symbols: ${brief.summary.changedSymbols}`)
  for (const row of brief.changes ?? []) lines.push(`Change: ${row.change} ${row.name} ${row.file}:${row.startLine}-${row.endLine} [${row.side}${row.ref ? ` @${row.ref}` : ''}]`, row.code ?? `Signature only: ${row.signature ?? ''}`)
  for (const row of brief.relations ?? []) lines.push(`Potential impact: ${row.name} ${row.file}:${row.line} [${row.resolution}; ${row.reason}]`)
  for (const row of brief.tests ?? []) lines.push(`Candidate test: ${row.file} [${row.resolution}; ${row.reason}]`)
  lines.push(`Gaps: ${brief.gaps.join('; ')}`)
  return lines.join('\n')
}

/** Reuses the caller's exact selection and analysis; never reroutes the task. */
export async function buildReviewBrief(index: RepoIndex, change: ChangeContextResult, budgetChars = 5000): Promise<ReviewOutput> {
  if (index.root !== change.root) throw new Error('review root mismatch')
  const limit = Number.isFinite(budgetChars) ? Math.max(300, Math.min(20000, Math.floor(budgetChars))) : 5000
  let head: string | null = null
  try { head = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: index.root, encoding: 'utf8', timeout: 3000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* explicit gap below */ }
  const brief: Brief = {
    version: 1,
    repository: { root: index.root, head, baseRef: change.baseRef ?? null, indexedAt: index.generatedAt },
    summary: { source: change.source, changedSymbols: change.changed.length },
    changes: [], relations: [], tests: [], verification: 'not-run',
    gaps: ['bounded-selection; not an atomic repository snapshot; re-query after edits', ...(!head ? ['HEAD-unavailable'] : [])],
  }
  const output = (): ReviewOutput => ({ text: render(brief), brief })
  // Charge the complete prospective tool envelope, including duplicated text.
  const fits = (): boolean => JSON.stringify(output()).length <= limit
  if (!fits()) return { text: 'Review Brief unavailable within budget. Tests not run.', brief: { version: 1, verification: 'not-run', gaps: ['budget: all evidence omitted'] } }
  const addGap = (gap: string): void => {
    if (brief.gaps.includes(gap)) return
    brief.gaps.push(gap)
    if (!fits()) brief.gaps.pop()
  }
  // Reserve an omission signal before selecting any payload.
  addGap('optional evidence may be omitted by budget; inspect original change context')
  const read = sourceReader(index)
  for (const row of change.changed) {
    const lines = await read(row.symbol.file, row.side, row.side === 'base' ? change.baseRef : undefined)
    const variants = excerptVariants(lines, row.symbol, row.side, row.side === 'base' ? change.baseRef : undefined, row.focusLine)
    for (const variant of variants) {
      brief.changes!.push({ ...variant, name: row.symbol.name, change: row.change })
      if (fits()) { if (variant.mode === 'signature') addGap('signature-only: source unavailable or budget-limited'); break }
      brief.changes!.pop()
    }
  }
  // Keep the existing weakest-path resolution; do not promote the last hop.
  for (const row of change.impact) {
    brief.relations!.push({ name: row.symbol.name, file: row.symbol.file, line: row.symbol.line, resolution: row.resolution, reason: row.via.reason })
    if (!fits()) brief.relations!.pop()
  }
  for (const row of change.tests) {
    brief.tests!.push({ file: row.file, resolution: row.resolution, reason: row.reason })
    if (!fits()) brief.tests!.pop()
  }
  // Existing warnings and unmapped/truncation are gaps, not an all-clear.
  for (const warning of change.warnings) addGap(warning)
  if (change.unmapped.length) addGap('unmapped changes exist')
  if (Object.values(change.truncated).some(Boolean)) addGap('upstream analysis truncated')
  return output()
}
