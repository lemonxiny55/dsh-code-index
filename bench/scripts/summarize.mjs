#!/usr/bin/env node
// summarize.mjs - aggregate BenchmarkRun records into paired per-block diffs.
//
// Usage:
//   node scripts/summarize.mjs [--runs artifacts/runs] [--out artifacts/summary.json] [--json]
//
// A "matched" (comparable) block is one task at one seed where all required arms
// are present AND no present arm is an infrastructure failure -- excluded, timed
// out, or a harness error (no exit code). Only matched blocks are comparable, so
// excluded/timed-out/harness-error blocks are reported separately and kept out of
// token/success aggregates and out of the block-count gate. Model failures are
// NOT excluded: a run whose judge failed is a matched, unsuccessful run. Percent
// claims are gated at 60 matched blocks.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const BENCH_ROOT = path.resolve(HERE, '..')

export const ARMS = ['stock', 'v0.5', 'v0.6', 'v0.7']
export const PAIRS = [
  ['v0.5', 'stock'],
  ['v0.6', 'stock'],
  ['v0.6', 'v0.5'],
  ['v0.7', 'stock'],
  ['v0.7', 'v0.6'],
  ['v0.7', 'v0.5'],
]
export const DECISION_BLOCKS = 30
export const PUBLISH_BLOCKS = 60

const USAGE = `summarize.mjs - aggregate runs into paired per-block diffs

A block (task x seed) is MATCHED only when all arms are present AND no present arm
is excluded, timed out, or a harness error. Excluded blocks are reported with
reasons and kept out of aggregates and out of the 30/60-block gate. Model
failures are not excluded: a failed judge is a matched, unsuccessful run.

Usage:
  node scripts/summarize.mjs [options]

Options:
  --runs <dir>   Directory containing *.run.json records (default bench/artifacts/runs).
  --out <file>   Summary JSON destination (default bench/artifacts/summary.json).
  --json         Print the summary object instead of the human table.
  --help         Show this help and exit.

Exit codes: 0 success, 2 usage error.
`

export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--json') out.json = true
    else if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1]
      if (val === undefined || val.startsWith('--')) throw new Error(`Missing value for --${key}`)
      out[key] = val
      i++
    }
  }
  return out
}

export function median(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b)
  if (nums.length === 0) return null
  const mid = Math.floor(nums.length / 2)
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2
}

export function mean(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v))
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function findRunRecords(dir) {
  if (!existsSync(dir)) return []
  const found = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name.endsWith('.run.json')) found.push(full)
    }
  }
  walk(dir)
  return found.sort()
}

function armView(record, recordPath) {
  const tokens = record.tokens || {}
  const view = {
    runId: record.runId,
    success: Boolean(record.success),
    excluded: Boolean(record.excluded),
    exclusionReason: typeof record.exclusionReason === 'string' && record.exclusionReason ? record.exclusionReason : null,
    timedOut: Boolean(record.timedOut),
    exitCode: typeof record.exitCode === 'number' ? record.exitCode : null,
    inputTokens: typeof tokens.input === 'number' ? tokens.input : null,
    outputTokens: typeof tokens.output === 'number' ? tokens.output : null,
    cachedTokens: typeof tokens.cached === 'number' ? tokens.cached : null,
    reasoningTokens: typeof tokens.reasoning === 'number' ? tokens.reasoning : null,
    toolCalls: typeof record.toolCalls === 'number' ? record.toolCalls : null,
    turns: typeof record.turns === 'number' ? record.turns : null,
    pluginContextChars: typeof record.pluginContextChars === 'number' ? record.pluginContextChars : null,
    wallMs: typeof record.wallMs === 'number' ? record.wallMs : null,
    tokenSource: tokens.source || null,
    recordPath,
  }
  view.disqualifyReason = disqualificationReason(view)
  view.disqualified = view.disqualifyReason !== null
  return view
}

/**
 * Why a present arm makes its whole block non-comparable, or null when the arm
 * is a valid (possibly unsuccessful) run.
 *
 * Excluded infrastructure runs, timed-out runs, and harness errors (no exit
 * code recorded) are set aside rather than scored; model failures are not.
 */
export function disqualificationReason(arm) {
  if (!arm) return null
  if (arm.excluded) return arm.exclusionReason ? `excluded: ${arm.exclusionReason}` : 'excluded (no reason recorded)'
  if (arm.timedOut) return 'timed out'
  if (arm.exitCode === null) return 'harness error (no exit code recorded)'
  return null
}

function pairDiff(block, treatment, baseline) {
  const t = block.arms[treatment]
  const b = block.arms[baseline]
  if (!t || !b) return null
  const tokens =
    t.inputTokens !== null && b.inputTokens !== null ? t.inputTokens - b.inputTokens : null
  const success = (t.success ? 1 : 0) - (b.success ? 1 : 0)
  return { treatment, baseline, inputTokens: tokens, success }
}

export function summarizeRuns({ runsDir }) {
  const records = findRunRecords(runsDir)
  const blocks = new Map()
  for (const recordPath of records) {
    let record
    try {
      record = JSON.parse(readFileSync(recordPath, 'utf8'))
    } catch {
      continue
    }
    if (!record || !record.blockId || !record.armId) continue
    if (!blocks.has(record.blockId)) {
      blocks.set(record.blockId, {
        blockId: record.blockId,
        taskId: record.taskId,
        category: record.category || null,
        seed: record.seed,
        repo: record.repo || null,
        arms: {},
      })
    }
    blocks.get(record.blockId).arms[record.armId] = armView(record, recordPath)
  }

  const blockList = [...blocks.values()].sort((a, b) =>
    a.blockId < b.blockId ? -1 : a.blockId > b.blockId ? 1 : 0,
  )
  for (const block of blockList) {
    block.presentArms = ARMS.filter((arm) => Boolean(block.arms[arm]))
    block.missingArms = ARMS.filter((arm) => !block.arms[arm])
    block.disqualifiedArms = ARMS.filter((arm) => block.arms[arm] && block.arms[arm].disqualified).map(
      (arm) => ({ arm, reason: block.arms[arm].disqualifyReason }),
    )
    // Comparable only when every arm ran AND no present arm is an infrastructure
    // failure (excluded / timed out / harness error). A model failure still matches.
    block.matched = block.missingArms.length === 0 && block.disqualifiedArms.length === 0
    block.excluded = block.disqualifiedArms.length > 0
    block.diffs = {}
    if (block.matched) {
      for (const [treatment, baseline] of PAIRS) {
        const diff = pairDiff(block, treatment, baseline)
        if (diff) block.diffs[`${treatment}-${baseline}`] = diff
      }
    }
  }

  const matched = blockList.filter((b) => b.matched)
  const incomplete = blockList
    .filter((b) => b.missingArms.length > 0)
    .map((b) => ({
      blockId: b.blockId,
      presentArms: b.presentArms,
      missingArms: b.missingArms,
      disqualifiedArms: b.disqualifiedArms,
    }))
  const excluded = blockList
    .filter((b) => b.disqualifiedArms.length > 0)
    .map((b) => ({
      blockId: b.blockId,
      taskId: b.taskId,
      seed: b.seed,
      reasons: b.disqualifiedArms,
    }))

  // Aggregates only ever see runs that are neither excluded nor timed out nor a
  // harness error, so infrastructure failures cannot inflate token/success figures.
  const statFor = (runs) => ({
    runCount: runs.length,
    successRate: runs.length ? mean(runs.map((r) => (r.success ? 1 : 0))) : null,
    medianInputTokens: median(runs.map((r) => r.inputTokens)),
    medianOutputTokens: median(runs.map((r) => r.outputTokens)),
    medianToolCalls: median(runs.map((r) => r.toolCalls)),
    medianTurns: median(runs.map((r) => r.turns)),
    medianPluginContextChars: median(runs.map((r) => r.pluginContextChars)),
    medianWallMs: median(runs.map((r) => r.wallMs)),
    nullTokenRuns: runs.filter((r) => r.inputTokens === null).length,
  })

  const armStats = {}
  for (const arm of ARMS) {
    armStats[arm] = statFor(blockList.map((b) => b.arms[arm]).filter((a) => a && !a.disqualified))
  }

  const matchedArmStats = {}
  for (const arm of ARMS) {
    matchedArmStats[arm] = statFor(matched.map((b) => b.arms[arm]).filter((a) => a && !a.disqualified))
  }

  const pairSummary = {}
  for (const [treatment, baseline] of PAIRS) {
    const diffs = matched.map((b) => b.diffs[`${treatment}-${baseline}`]).filter(Boolean)
    pairSummary[`${treatment}-${baseline}`] = {
      pairs: diffs.length,
      tokenPairs: diffs.filter((d) => d.inputTokens !== null).length,
      medianInputTokenDiff: median(diffs.map((d) => d.inputTokens)),
      meanSuccessDiff: mean(diffs.map((d) => d.success)),
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runsDir,
    recordCount: records.length,
    blockCount: blockList.length,
    matchedBlockCount: matched.length,
    excludedBlockCount: excluded.length,
    incompleteBlockCount: incomplete.length,
    arms: ARMS,
    armStats,
    matchedArmStats,
    pairSummary,
    claimGate: {
      decisionBlocks: DECISION_BLOCKS,
      publishBlocks: PUBLISH_BLOCKS,
      matchedBlocks: matched.length,
      mayDecide: matched.length >= DECISION_BLOCKS,
      mayPublishPercent: matched.length >= PUBLISH_BLOCKS,
      reason:
        matched.length >= PUBLISH_BLOCKS
          ? 'matched block count meets the 60-block publishing gate'
          : `only ${matched.length} matched blocks; >=${PUBLISH_BLOCKS} required before any public percentage claim (>=${DECISION_BLOCKS} for internal decisions)`,
    },
    blocks: blockList,
    excludedBlocks: excluded,
    incompleteBlocks: incomplete,
  }
}

function formatNumber(n, digits = 0) {
  if (n === null || n === undefined) return 'n/a'
  return typeof n === 'number' ? n.toFixed(digits) : String(n)
}

function humanTable(summary) {
  const lines = []
  lines.push(`summary generated ${summary.generatedAt}`)
  lines.push(`runs dir: ${summary.runsDir}`)
  lines.push(`records: ${summary.recordCount}  blocks: ${summary.blockCount}  matched blocks: ${summary.matchedBlockCount}  ` +
    `excluded blocks: ${summary.excludedBlockCount}  incomplete blocks: ${summary.incompleteBlockCount}`)
  lines.push('')
  lines.push('per-arm median over matched blocks (inside comparable blocks only):')
  lines.push('arm     runs  success  inTok(median)  toolCalls  turns  pluginChars  nullTok')
  for (const arm of ARMS) {
    const s = summary.matchedArmStats[arm]
    lines.push(
      `${arm.padEnd(7)} ${String(s.runCount).padStart(4)}  ${formatNumber(s.successRate * 100, 1).padStart(5)}%  ` +
        `${formatNumber(s.medianInputTokens).padStart(12)}  ${formatNumber(s.medianToolCalls).padStart(9)}  ` +
        `${formatNumber(s.medianTurns).padStart(5)}  ${formatNumber(s.medianPluginContextChars).padStart(11)}  ${String(s.nullTokenRuns).padStart(6)}`,
    )
  }
  lines.push('')
  lines.push('paired diffs over matched blocks (treatment - baseline):')
  for (const key of Object.keys(summary.pairSummary)) {
    const p = summary.pairSummary[key]
    lines.push(
      `${key.padEnd(12)} pairs=${String(p.pairs).padStart(3)}  tokenPairs=${String(p.tokenPairs).padStart(3)}  ` +
        `medianInputTokenDiff=${formatNumber(p.medianInputTokenDiff)}  meanSuccessDiff=${formatNumber(p.meanSuccessDiff, 3)}`,
    )
  }
  lines.push('')
  lines.push(`claim gate: ${summary.claimGate.reason}`)
  if (summary.excludedBlocks.length) {
    lines.push('')
    lines.push(`excluded blocks (${summary.excludedBlocks.length}, not counted in the gate or aggregates):`)
    for (const b of summary.excludedBlocks.slice(0, 20)) {
      const reasons = b.reasons.map((r) => `${r.arm}: ${r.reason}`).join('; ')
      lines.push(`  ${b.blockId} -> ${reasons}`)
    }
    if (summary.excludedBlocks.length > 20) lines.push(`  ... and ${summary.excludedBlocks.length - 20} more`)
  }
  if (summary.incompleteBlocks.length) {
    lines.push('')
    lines.push(`incomplete blocks (${summary.incompleteBlocks.length}):`)
    for (const b of summary.incompleteBlocks.slice(0, 20)) {
      const disq = b.disqualifiedArms.length
        ? ` disqualified=[${b.disqualifiedArms.map((d) => `${d.arm}:${d.reason}`).join(',')}]`
        : ''
      lines.push(`  ${b.blockId} present=[${b.presentArms.join(',')}] missing=[${b.missingArms.join(',')}]${disq}`)
    }
    if (summary.incompleteBlocks.length > 20) lines.push(`  ... and ${summary.incompleteBlocks.length - 20} more`)
  }
  return lines.join('\n') + '\n'
}

async function main(argv) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (err) {
    process.stderr.write(`summarize: ${err.message}\n\n${USAGE}`)
    return 2
  }
  if (opts.help) {
    process.stdout.write(USAGE)
    return 0
  }
  try {
    const runsDir = path.resolve(opts.runs || path.join(BENCH_ROOT, 'artifacts', 'runs'))
    const outFile = path.resolve(opts.out || path.join(BENCH_ROOT, 'artifacts', 'summary.json'))
    const summary = summarizeRuns({ runsDir })
    mkdirSync(path.dirname(outFile), { recursive: true })
    writeFileSync(outFile, JSON.stringify(summary, null, 2) + '\n')
    if (opts.json) process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
    else process.stdout.write(humanTable(summary))
    return 0
  } catch (err) {
    process.stderr.write(`summarize: ${err.stack || err.message}\n`)
    return 1
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main(process.argv.slice(2)).then((code) => process.exit(code))
