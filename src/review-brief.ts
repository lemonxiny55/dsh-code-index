/** Bounded presentation of one existing change analysis; no new graph or task routing. */
import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import type { CrossPackageImpact, RepoIndex } from './types.js'
import type { ChangeContextResult, ChangeKind, ImpactHop } from './change-context.js'
import type { ResolutionLabel } from './refgraph.js'
import { findCycles } from './health.js'
import { excerptVariants, sourceReader, type SourceExcerpt } from './source-excerpts.js'
import { deriveCommandLeads, type ReviewTestLead } from './test-leads.js'
import { computeCrossPackageImpact, formatCrossPackageImpact } from './workspace.js'

export interface ReviewRepository {
  root: string
  head: string | null
  baseRef: string | null
  dirty: boolean | null
  indexedAt: number
  observedAt: number
  snapshot: 'non-atomic'
}
export interface ReviewChange extends SourceExcerpt {
  name: string
  change: ChangeKind
  sourceGap?: 'source-unavailable' | 'source-budget'
}
export type ReviewRelation =
  | { kind: 'call'; name: string; file: string; line: number; depth: number; resolution: ResolutionLabel; via: ImpactHop }
  | { kind: 'import'; file: string; changedFile: string; specifier: string; resolution: 'import-scoped'; via?: string; ambiguousAlias?: boolean }
export interface ReviewCycleWarning {
  files: string[]
  changedFiles: string[]
  totalFiles: number
  truncated: boolean
}
interface ReviewBase {
  version: 1
  scope: 'indexed-static-only'
  verification: 'not-run'
  gaps: string[]
  /** Complete {text, brief} JSON character count, not just the rendered text. */
  budget: { limit: number; usedChars: number }
}
export interface ReviewBriefV1 extends ReviewBase {
  status: 'bounded'
  repository: ReviewRepository
  summary: {
    source: ChangeContextResult['source']
    changes: number; relations: number; tests: number; unmapped: number
    index: { parsed: number; partial: number; failed: number; unknown: number }
  }
  changes: ReviewChange[]
  relations: ReviewRelation[]
  tests: ReviewTestLead[]
  warnings: string[]
  cycleWarnings?: ReviewCycleWarning[]
  crossPackageImpact?: CrossPackageImpact[]
  /** Counts are relative to the bounded upstream analysis, not the entire repository. */
  omitted: { changes: number; relations: number; tests: number; warnings: number; sourceBodies: number }
}
export interface OmittedReviewBrief extends ReviewBase {
  status: 'omitted'
  repository?: never; summary?: never; changes?: never; relations?: never
  tests?: never; warnings?: never; cycleWarnings?: never; crossPackageImpact?: never; omitted?: never
}
export type ReviewBrief = ReviewBriefV1 | OmittedReviewBrief
export interface ReviewOutput { text: string; brief: ReviewBrief }

export const REVIEW_LIMITS = {
  changes: 24,
  relations: 40,
  tests: 20,
  warnings: 12,
  cycles: 4,
  crossPackage: 12,
} as const

const MAX_CYCLE_DISPLAY_FILES = 5

function git(root: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: root, encoding: 'utf8', timeout: 3000, maxBuffer: 1024 * 1024,
      windowsHide: true, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }, (error, stdout) => error ? reject(error) : resolve(stdout))
  })
}

/** Git metadata is observational, never an identity/authorization or freshness token. */
async function repositoryInfo(index: RepoIndex, change: ChangeContextResult): Promise<ReviewRepository> {
  const repository: ReviewRepository = { root: index.root, head: null, baseRef: change.baseRef ?? null,
    dirty: null, indexedAt: index.generatedAt, observedAt: Date.now(), snapshot: 'non-atomic' }
  // Caller-supplied diffs do not cause extra Git commands for presentation.
  if (change.source === 'diff') return repository
  try {
    const top = (await git(index.root, ['rev-parse', '--show-toplevel'])).trim()
    if (await realpath(top) !== await realpath(index.root)) return repository
    try {
      const head = (await git(index.root, ['rev-parse', '--verify', 'HEAD^{commit}'])).trim()
      if (/^[a-f0-9]{40,64}$/i.test(head)) repository.head = head
    } catch { /* unborn or unavailable HEAD remains null */ }
    try {
      // Local index cache is not a repository code edit, even without .gitignore.
      repository.dirty = (await git(index.root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal',
        '--', '.', ':(exclude).dsh-code-index'])).length > 0
    } catch { /* failed status is unknown, never clean */ }
  } catch { /* no Git, different parent repository, or command failure */ }
  repository.observedAt = Date.now()
  return repository
}

function detectChangedCycles(index: RepoIndex, change: ChangeContextResult): ReviewCycleWarning[] {
  const changedFiles = new Set<string>()
  for (const row of change.changed) {
    if (row.side === 'current') changedFiles.add(row.symbol.file)
  }
  for (const row of change.unmapped) {
    if (row.side === 'current') changedFiles.add(row.file)
  }
  if (changedFiles.size === 0) return []

  const warnings: ReviewCycleWarning[] = []
  for (const cycle of findCycles(index)) {
    const touched = cycle.filter((file) => changedFiles.has(file)).sort((a, b) => a.localeCompare(b))
    if (touched.length === 0) continue
    const untouched = cycle.filter((file) => !changedFiles.has(file)).sort((a, b) => a.localeCompare(b))
    const ordered = [...touched, ...untouched]
    const shown = ordered.slice(0, MAX_CYCLE_DISPLAY_FILES)
    warnings.push({
      files: shown,
      changedFiles: touched,
      totalFiles: cycle.length,
      truncated: cycle.length > shown.length,
    })
  }
  return warnings.slice(0, REVIEW_LIMITS.cycles)
}

function formatCycleWarning(entry: ReviewCycleWarning): string {
  const chain = entry.files.join(' -> ')
  return `cycle-warning: ${chain}${entry.truncated ? ` (+${entry.totalFiles - entry.files.length} more)` : ''}`
}

export function renderReviewBrief(brief: ReviewBrief): string {
  if (brief.status === 'omitted') return 'Review Brief omitted: budget. Static only; tests not run.'
  const r = brief.repository, s = brief.summary
  const lines = ['Review Brief — indexed static only; runtime behavior not proven.',
    `Repo/worktree: ${r.root}`, `HEAD: ${r.head ?? 'unavailable'}; base: ${r.baseRef ?? 'not provided'}; dirty: ${r.dirty ?? 'unknown'}`,
    `Index built: ${new Date(r.indexedAt).toISOString()}; metadata observed: ${new Date(r.observedAt).toISOString()}`,
    'Snapshot: non-atomic; re-query after edits.',
    `Selection: ${s.source}; ${s.changes} changed symbols, ${s.relations} static relations, ${s.tests} candidate tests, ${s.unmapped} unmapped changes.`,
    `Index: ${s.index.parsed} parsed, ${s.index.partial} partial, ${s.index.failed} failed, ${s.index.unknown} unknown; parsed is not semantic proof.`]
  if (s.relations === 0) lines.push('No static relationships found in this analysis; not proof of no callers or runtime impact.')
  for (const row of brief.changes) {
    lines.push(`Change: ${row.change} ${row.name} ${row.file}:${row.startLine}-${row.endLine} [${row.side}${row.ref ? ` @${row.ref}` : ''}; ${row.mode}]`,
      row.code ?? `Signature only (${row.sourceGap}): ${row.signature ?? ''}`)
  }
  for (const row of brief.relations) lines.push(row.kind === 'call'
    ? `Potential impact: ${row.name} ${row.file}:${row.line} [path ${row.resolution}; depth ${row.depth}]; via ${row.via.callSite.file}:${row.via.callSite.line} [hop ${row.via.resolution}; ${row.via.reason}${row.via.via ? `; via: ${row.via.via}` : ''}]`
    : `Import dependent: ${row.file} -> ${row.changedFile} (${row.specifier}) [${row.resolution}${row.via ? `; via: ${row.via}` : ''}]`)
  if (brief.crossPackageImpact?.length) {
    lines.push('Cross-package impact:')
    for (const row of brief.crossPackageImpact) lines.push(`  ${formatCrossPackageImpact(row)}`)
  }
  lines.push('Candidate tests: not-run; coverage not verified.')
  for (const row of brief.tests) {
    lines.push(`Candidate: ${row.file} [${row.resolution}; ${row.reason}]${row.commandLead ? ` — lead: ${row.commandLead}` : ''}`)
  }
  for (const warning of brief.warnings) lines.push(`Warning: ${warning}`)
  lines.push(`Omitted from analysis: ${brief.omitted.changes} changes, ${brief.omitted.relations} relations, ${brief.omitted.tests} tests, ${brief.omitted.warnings} warnings; ${brief.omitted.sourceBodies} source bodies not included.`,
    `Gaps: ${brief.gaps.join('; ')}`, `Budget (full JSON envelope): ${brief.budget.usedChars}/${brief.budget.limit}`)
  return lines.join('\n')
}

function account(brief: ReviewBrief): ReviewOutput {
  // Both text and serialized DTO contain the counter. Iterate to a fixed point.
  for (let n = 0; n < 8; n++) {
    const output = { text: renderReviewBrief(brief), brief }
    const used = JSON.stringify(output).length
    if (used === brief.budget.usedChars) return output
    brief.budget.usedChars = used
  }
  return { text: renderReviewBrief(brief), brief }
}

/** Reads only source excerpts and static manifests for the supplied analysis; never executes candidate tests. */
export async function buildReviewBrief(index: RepoIndex, change: ChangeContextResult, budgetChars = 5000): Promise<ReviewOutput> {
  if (path.resolve(index.root) !== path.resolve(change.root)) throw new Error('review root mismatch')
  const limit = Number.isFinite(budgetChars) ? Math.max(300, Math.min(20000, Math.floor(budgetChars))) : 5000
  const fallback = () => account({ version: 1, status: 'omitted', scope: 'indexed-static-only', verification: 'not-run',
    gaps: ['budget: all evidence and repository metadata omitted'], budget: { limit, usedChars: 0 } })
  const repository = await repositoryInfo(index, change)
  const indexStatus = { parsed: 0, partial: 0, failed: 0, unknown: 0 }
  for (const file of index.files) indexStatus[file.diagnostic?.status ?? 'unknown']++
  // Preserve the analysis's weakest path grade separately from its last hop.
  const relations: ReviewRelation[] = [...change.directCallers, ...change.impact].map(row => ({ kind: 'call', name: row.symbol.name,
    file: row.symbol.file, line: row.symbol.line, depth: row.depth, resolution: row.resolution, via: row.via }))
  relations.push(...change.importDependents.map(row => ({ kind: 'import' as const, ...row })))
  const { leads: testLeads, hasUnresolvedRunner } = await deriveCommandLeads(index.root, change.tests)
  const baseTests: ReviewTestLead[] = testLeads.map(({ commandLead: _omit, ...rest }) => rest)
  const cycles = detectChangedCycles(index, change)
  const cycleWarningTexts = cycles.map(formatCycleWarning)
  const allWarnings = [...cycleWarningTexts, ...change.warnings]
  const crossPackages = computeCrossPackageImpact(index, change, REVIEW_LIMITS.crossPackage)

  const upstreamGaps = new Set(change.evidence?.gaps?.map(gap => gap.code) ?? [])
  upstreamGaps.add('non-atomic-snapshot')
  if (change.source === 'diff') upstreamGaps.add('git-metadata-not-collected-for-inline-diff')
  else { if (!repository.head) upstreamGaps.add('HEAD-unavailable'); if (repository.dirty === null) upstreamGaps.add('dirty-status-unavailable') }
  if (change.unmapped.length) upstreamGaps.add('unmapped-changes')
  if (change.paths.length) upstreamGaps.add('entry-paths-not-projected; use xray for full paths')
  if (Object.values(change.truncated).some(Boolean)) upstreamGaps.add('upstream-analysis-truncated')
  if (indexStatus.partial || indexStatus.failed) upstreamGaps.add('parse-diagnostics')
  if (indexStatus.unknown) upstreamGaps.add('parse-status-unknown')
  if (!change.changed.length) upstreamGaps.add('no-changed-symbols-in-analysis')
  if (!change.tests.length) upstreamGaps.add('no-test-candidates-in-analysis')
  if (hasUnresolvedRunner) upstreamGaps.add('verification-command-unavailable')
  if (relations.some(row => row.kind === 'call' ? Boolean(row.via.ambiguousAlias) : Boolean(row.ambiguousAlias))) {
    upstreamGaps.add('ambiguous-alias')
  }
  if (change.changed.length > REVIEW_LIMITS.changes || relations.length > REVIEW_LIMITS.relations ||
    change.tests.length > REVIEW_LIMITS.tests || allWarnings.length > REVIEW_LIMITS.warnings) upstreamGaps.add('projection-row-cap')
  const brief: ReviewBriefV1 = { version: 1, status: 'bounded', scope: 'indexed-static-only', verification: 'not-run', repository,
    summary: { source: change.source, changes: change.changed.length, relations: relations.length, tests: change.tests.length,
      unmapped: change.unmapped.length, index: indexStatus }, changes: [], relations: [], tests: [], warnings: [], gaps: [],
    omitted: { changes: 0, relations: 0, tests: 0, warnings: 0, sourceBodies: 0 }, budget: { limit, usedChars: 0 } }
  let commandLeadTrimmed = false
  let crossPackageTrimmed = false
  const output = (): ReviewOutput => {
    brief.omitted = { changes: change.changed.length - brief.changes.length, relations: relations.length - brief.relations.length,
      tests: change.tests.length - brief.tests.length, warnings: allWarnings.length - brief.warnings.length,
      sourceBodies: change.changed.length - brief.changes.filter(row => row.code !== undefined).length }
    const gaps = new Set(upstreamGaps)
    if (Object.values(brief.omitted).some(Boolean)) gaps.add('evidence-omitted')
    if (commandLeadTrimmed) gaps.add('command-lead-budget')
    if (crossPackageTrimmed) gaps.add('cross-package-impact-budget')
    for (const row of brief.changes) {
      if (row.sourceGap) { gaps.add(row.sourceGap); gaps.add('signature-only') }
      if (row.mode === 'window') gaps.add('source-window')
    }
    brief.gaps = [...gaps].sort()
    return account(brief)
  }
  const fits = (): boolean => output().brief.budget.usedChars <= limit
  if (!fits()) return fallback()
  const add = <T>(rows: T[], row: T): boolean => { rows.push(row); if (fits()) return true; rows.pop(); return false }
  // Reserve a representative test (without commandLead yet) and relation before source bodies can fill the budget.
  if (baseTests[0]) add(brief.tests, { ...baseTests[0] })
  if (relations[0]) add(brief.relations, relations[0])
  const read = sourceReader(index)
  for (const row of change.changed.slice(0, REVIEW_LIMITS.changes)) {
    const lines = await read(row.symbol.file, row.side, row.side === 'base' ? change.baseRef : undefined)
    const sourceAvailable = lines !== null && row.symbol.line >= 1 && row.symbol.endLine >= row.symbol.line && row.symbol.endLine <= lines.length
    for (const variant of excerptVariants(lines, row.symbol, row.side, row.side === 'base' ? change.baseRef : undefined, row.focusLine)) {
      const candidate: ReviewChange = { ...variant, name: row.symbol.name, change: row.change,
        ...(variant.mode === 'signature' ? { sourceGap: !sourceAvailable ? 'source-unavailable' as const : 'source-budget' as const } : {}) }
      if (add(brief.changes, candidate)) break
    }
  }
  // Alternate the remaining relation/test rows; preserve upstream ranking and grades.
  for (let n = 0; n < Math.max(REVIEW_LIMITS.relations, REVIEW_LIMITS.tests); n++) {
    const relation = relations[n], test = baseTests[n]
    if (n < REVIEW_LIMITS.relations && relation && !brief.relations.includes(relation)) add(brief.relations, relation)
    if (n < REVIEW_LIMITS.tests && test && !brief.tests.some(t => t.file === test.file && t.reason === test.reason)) add(brief.tests, { ...test })
  }
  for (const warning of allWarnings.slice(0, REVIEW_LIMITS.warnings)) add(brief.warnings, warning)
  if (cycles.length > 0) {
    brief.cycleWarnings = []
    for (const cycle of cycles) {
      if (!add(brief.cycleWarnings, cycle)) break
    }
    if (brief.cycleWarnings.length === 0) delete brief.cycleWarnings
  }
  if (crossPackages.length > 0) {
    brief.crossPackageImpact = []
    for (const row of crossPackages) {
      if (!add(brief.crossPackageImpact, row)) {
        crossPackageTrimmed = true
        if (!fits()) crossPackageTrimmed = false
        break
      }
    }
    if (brief.crossPackageImpact.length < crossPackages.length && !crossPackageTrimmed) {
      crossPackageTrimmed = true
      if (!fits()) crossPackageTrimmed = false
    }
    if (brief.crossPackageImpact.length === 0) delete brief.crossPackageImpact
  }
  // Attach optional commandLeads last so tight budgets trim leads before core source/relations.
  const leadByFile = new Map(testLeads.map(lead => [lead.file, lead.commandLead]))
  for (const row of brief.tests) {
    const lead = leadByFile.get(row.file)
    if (!lead) continue
    row.commandLead = lead
    if (!fits()) {
      delete row.commandLead
      commandLeadTrimmed = true
      if (!fits()) commandLeadTrimmed = false
    }
  }
  // Return detached plain data, so later DTO edits cannot mutate the original analysis.
  return JSON.parse(JSON.stringify(output())) as ReviewOutput
}
