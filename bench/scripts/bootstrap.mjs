#!/usr/bin/env node
// bootstrap.mjs - non-parametric paired bootstrap over matched task-seed blocks.
//
// Usage:
//   node scripts/bootstrap.mjs [--input artifacts/summary.json] [--iterations 10000] [--seed 42]
//
// For each treatment/baseline arm pair this resamples the matched blocks WITH
// REPLACEMENT (the same resample indices are used for both arms, so the test is
// genuinely paired), recomputes the median input-token difference and the
// success-rate difference, and reports the 2.5/97.5 percentile bounds.
//
// The PRNG is seeded and the exact resample count is printed. No result is
// invented: blocks with a null input-token count are dropped from the token
// metric and the number dropped is reported.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const BENCH_ROOT = path.resolve(HERE, '..')

const USAGE = `bootstrap.mjs - paired bootstrap confidence intervals over matched blocks

Usage:
  node scripts/bootstrap.mjs [options]

Options:
  --input <file>       Summary JSON from summarize.mjs (default bench/artifacts/summary.json).
  --iterations <n>     Bootstrap resamples per metric (default 10000).
  --seed <n>           PRNG seed (default 42). Recorded and printed.
  --alpha <n>          Two-sided alpha (default 0.05 -> 2.5/97.5 percentiles).
  --baseline <arm>     Baseline arm (default stock).
  --treatments <list>  Comma-separated treatment arms (default v0.5,v0.6,v0.7).
  --json               Print the result object as JSON.
  --help               Show this help and exit.

Exit codes: 0 success, 2 no data / usage error.
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

// Deterministic, dependency-free PRNG (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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

// Percentile with linear interpolation between closest ranks.
export function percentile(sorted, p) {
  if (!sorted.length) return null
  if (sorted.length === 1) return sorted[0]
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

/**
 * Paired bootstrap for one metric.
 * @param {Array<{base:number,treat:number}>} pairs
 * @param {number} iterations
 * @param {() => number} rng
 * @param {'median'|'mean'} estimator
 */
export function pairedBootstrap(pairs, iterations, rng, estimator) {
  const n = pairs.length
  const stat = (sample) => {
    const diffs = sample.map((p) => p.treat - p.base)
    return estimator === 'mean' ? mean(diffs) : median(diffs)
  }
  const point = stat(pairs)
  const dist = new Array(iterations)
  for (let i = 0; i < iterations; i++) {
    const sample = new Array(n)
    for (let j = 0; j < n; j++) sample[j] = pairs[Math.floor(rng() * n)]
    dist[i] = stat(sample)
  }
  dist.sort((a, b) => a - b)
  return { point, dist }
}

export function runBootstrap({ summary, baseline = 'stock', treatments = ['v0.5', 'v0.6', 'v0.7'], iterations = 10000, seed = 42, alpha = 0.05 }) {
  if (!summary || !Array.isArray(summary.blocks)) throw new Error('summary JSON has no blocks array')
  const matched = summary.blocks.filter((b) => b.matched && b.arms && b.arms[baseline])
  const rng = mulberry32(seed)
  const results = {}

  for (const treatment of treatments) {
    const comparable = matched.filter((b) => b.arms[treatment])
    const tokenPairs = comparable
      .filter((b) => b.arms[treatment].inputTokens !== null && b.arms[baseline].inputTokens !== null)
      .map((b) => ({ base: b.arms[baseline].inputTokens, treat: b.arms[treatment].inputTokens }))
    const successPairs = comparable.map((b) => ({
      base: b.arms[baseline].success ? 1 : 0,
      treat: b.arms[treatment].success ? 1 : 0,
    }))
    const droppedTokenBlocks = comparable.length - tokenPairs.length

    const tokenBoot = tokenPairs.length ? pairedBootstrap(tokenPairs, iterations, rng, 'median') : null
    const successBoot = successPairs.length ? pairedBootstrap(successPairs, iterations, rng, 'mean') : null

    results[`${treatment}-${baseline}`] = {
      treatment,
      baseline,
      comparableBlocks: comparable.length,
      token: tokenBoot
        ? {
            pairs: tokenPairs.length,
            droppedNullTokenBlocks: droppedTokenBlocks,
            pointMedianInputTokenDiff: tokenBoot.point,
            ci95: [
              percentile(tokenBoot.dist, (alpha / 2) * 100),
              percentile(tokenBoot.dist, (1 - alpha / 2) * 100),
            ],
            resampleCount: iterations,
            estimator: 'median',
          }
        : { pairs: 0, droppedNullTokenBlocks: droppedTokenBlocks, pointMedianInputTokenDiff: null, ci95: [null, null], resampleCount: 0, estimator: 'median' },
      success: successBoot
        ? {
            pairs: successPairs.length,
            pointSuccessRateDiff: successBoot.point,
            ci95: [
              percentile(successBoot.dist, (alpha / 2) * 100),
              percentile(successBoot.dist, (1 - alpha / 2) * 100),
            ],
            resampleCount: iterations,
            estimator: 'mean',
          }
        : { pairs: 0, pointSuccessRateDiff: null, ci95: [null, null], resampleCount: 0, estimator: 'mean' },
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: summary.runsDir || null,
    baseline,
    treatments,
    iterations,
    seed,
    alpha,
    matchedBlocks: matched.length,
    claimGate: summary.claimGate || null,
    results,
  }
}

function fmt(n, digits = 1) {
  return n === null || n === undefined ? 'n/a' : Number(n).toFixed(digits)
}

function humanReport(out) {
  const lines = []
  lines.push(`paired bootstrap: baseline=${out.baseline} seed=${out.seed} iterations=${out.iterations} alpha=${out.alpha}`)
  lines.push(`matched blocks available: ${out.matchedBlocks}`)
  lines.push(`resample count: ${out.iterations} per metric (printed once per metric below)`)
  lines.push('')
  for (const [key, r] of Object.entries(out.results)) {
    lines.push(`${key}: comparable blocks=${r.comparableBlocks}`)
    lines.push(
      `  median input-token diff (treatment-baseline): ${fmt(r.token.pointMedianInputTokenDiff)} ` +
        `95% CI [${fmt(r.token.ci95[0])}, ${fmt(r.token.ci95[1])}] ` +
        `pairs=${r.token.pairs} droppedNullTokenBlocks=${r.token.droppedNullTokenBlocks} resamples=${r.token.resampleCount}`,
    )
    lines.push(
      `  success-rate diff (treatment-baseline): ${fmt(r.success.pointSuccessRateDiff, 3)} ` +
        `95% CI [${fmt(r.success.ci95[0], 3)}, ${fmt(r.success.ci95[1], 3)}] ` +
        `pairs=${r.success.pairs} resamples=${r.success.resampleCount}`,
    )
    if (r.success.pairs > 0 && r.success.pairs < 10) {
      lines.push('  warning: fewer than 10 paired blocks; interval is unstable, do not publish')
    }
  }
  if (out.claimGate && !out.claimGate.mayPublishPercent) {
    lines.push('')
    lines.push(`claim gate: ${out.claimGate.reason}`)
  }
  return lines.join('\n') + '\n'
}

async function main(argv) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (err) {
    process.stderr.write(`bootstrap: ${err.message}\n\n${USAGE}`)
    return 2
  }
  if (opts.help) {
    process.stdout.write(USAGE)
    return 0
  }
  try {
    const input = path.resolve(opts.input || path.join(BENCH_ROOT, 'artifacts', 'summary.json'))
    if (!existsSync(input)) {
      process.stderr.write(`bootstrap: summary not found: ${input}\nRun scripts/summarize.mjs first.\n`)
      return 2
    }
    const summary = JSON.parse(readFileSync(input, 'utf8'))
    const treatments = opts.treatments ? String(opts.treatments).split(',').map((s) => s.trim()).filter(Boolean) : ['v0.5', 'v0.6', 'v0.7']
    const out = runBootstrap({
      summary,
      baseline: opts.baseline || 'stock',
      treatments,
      iterations: opts.iterations ? Number(opts.iterations) : 10000,
      seed: opts.seed !== undefined ? Number(opts.seed) : 42,
      alpha: opts.alpha !== undefined ? Number(opts.alpha) : 0.05,
    })
    const totalPairs = Object.values(out.results).reduce((acc, r) => acc + r.success.pairs, 0)
    if (totalPairs === 0) {
      process.stderr.write('bootstrap: no matched blocks found; nothing to resample.\n')
      return 2
    }
    if (opts.json) process.stdout.write(JSON.stringify(out, null, 2) + '\n')
    else process.stdout.write(humanReport(out))
    return 0
  } catch (err) {
    process.stderr.write(`bootstrap: ${err.stack || err.message}\n`)
    return 1
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main(process.argv.slice(2)).then((code) => process.exit(code))
