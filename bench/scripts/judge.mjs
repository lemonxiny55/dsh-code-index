#!/usr/bin/env node
// judge.mjs - run a task's deterministic judge commands in a prepared workdir.
//
// Usage:
//   node scripts/judge.mjs --task tasks/narrow/001-find-definition.json --workdir <prepared/repo> [--json]
//
// Every judge command runs through `sh -c` with cwd = workdir and must exit 0.
// requiredFiles must exist; forbiddenFiles must not. Exits 0 when the run passes.

import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const BENCH_ROOT = path.resolve(HERE, '..')

const USAGE = `judge.mjs - deterministic pass/fail for one prepared task workdir

Usage:
  node scripts/judge.mjs --task <task.json> --workdir <dir> [options]

Options:
  --task <path>      BenchmarkTask JSON (required).
  --workdir <dir>    Prepared repository workdir (required).
  --timeout-ms <n>   Per-command timeout in ms (default 120000).
  --json             Emit the full result object as JSON.
  --help             Show this help and exit.

Exit codes: 0 pass, 1 fail, 2 usage error.
`

function parseArgs(argv) {
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

function truncate(text, max) {
  const s = String(text ?? '')
  return s.length > max ? `${s.slice(0, max)}\n...[truncated ${s.length - max} chars]` : s
}

function runShell(command, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    execFile(
      '/bin/sh',
      ['-c', command],
      { cwd, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        let exitCode = 0
        let error = null
        if (err) {
          exitCode = typeof err.code === 'number' ? err.code : null
          error = err.killed ? `timed out after ${timeoutMs}ms` : String(err.message || err)
        }
        resolve({ command, exitCode, passed: !err, stdout, stderr, error })
      },
    )
  })
}

/**
 * Run all judge commands and file checks.
 * @returns {Promise<{passed:boolean, results:Array, requiredFiles:Array, forbiddenFiles:Array, reason:string|null}>}
 */
export async function runJudge({ task, workdir, timeoutMs = 120000, outputCharCap = 4000 }) {
  if (!task || !Array.isArray(task.judge?.commands) || task.judge.commands.length === 0) {
    throw new Error('task.judge.commands must be a non-empty array')
  }
  if (!workdir || !existsSync(workdir)) throw new Error(`workdir does not exist: ${workdir}`)

  const results = []
  let reason = null
  for (const command of task.judge.commands) {
    const raw = await runShell(command, { cwd: workdir, timeoutMs })
    const result = {
      command,
      exitCode: raw.exitCode,
      passed: raw.passed,
      stdout: truncate(raw.stdout, outputCharCap),
      stderr: truncate(raw.stderr, outputCharCap),
      error: raw.error,
    }
    results.push(result)
    if (!raw.passed) {
      reason = `judge command failed (exit ${raw.exitCode}): ${command}`
      break
    }
  }

  const checkFile = (rel) => ({ path: rel, present: existsSync(path.join(workdir, rel)) })
  const requiredFiles = (task.judge.requiredFiles || []).map(checkFile)
  const forbiddenFiles = (task.judge.forbiddenFiles || []).map(checkFile)

  for (const r of requiredFiles) {
    if (!r.present) {
      reason = reason || `required file missing: ${r.path}`
      break
    }
  }
  for (const f of forbiddenFiles) {
    if (f.present) {
      reason = reason || `forbidden file present: ${f.path}`
      break
    }
  }

  const passed =
    results.length === task.judge.commands.length &&
    results.every((r) => r.passed) &&
    requiredFiles.every((r) => r.present) &&
    forbiddenFiles.every((f) => !f.present)

  return { passed, results, requiredFiles, forbiddenFiles, reason: passed ? null : reason }
}

async function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`judge: ${err.message}\n\n${USAGE}`)
    process.exit(2)
  }
  if (opts.help) {
    process.stdout.write(USAGE)
    process.exit(0)
  }
  if (!opts.task || !opts.workdir) {
    process.stderr.write(`judge: --task and --workdir are required\n\n${USAGE}`)
    process.exit(2)
  }
  try {
    const task = JSON.parse(readFileSync(path.resolve(opts.task), 'utf8'))
    const timeoutMs = opts['timeout-ms'] ? Number(opts['timeout-ms']) : 120000
    const result = await runJudge({ task, workdir: path.resolve(opts.workdir), timeoutMs })
    if (opts.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    } else {
      for (const r of result.results) {
        process.stdout.write(`${r.passed ? 'PASS' : 'FAIL'} (exit ${r.exitCode}) ${r.command}\n`)
      }
      process.stdout.write(result.passed ? 'judge: PASS\n' : `judge: FAIL - ${result.reason}\n`)
    }
    process.exit(result.passed ? 0 : 1)
  } catch (err) {
    process.stderr.write(`judge: ${err.message}\n`)
    process.exit(2)
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
