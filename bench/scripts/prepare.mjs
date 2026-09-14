#!/usr/bin/env node
// prepare.mjs - clone/checkout a task's pinned repository commit into a temp workdir.
//
// Usage:
//   node scripts/prepare.mjs --task tasks/narrow/001-find-definition.json
//   node scripts/prepare.mjs --repo json5 [--commit <sha>] [--refresh] [--json]
//
// This script uses only git via child_process.execFile and Node built-ins.
// It never interpolates into a shell.

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const BENCH_ROOT = path.resolve(HERE, '..')

const USAGE = `prepare.mjs - clone and check out a pinned commit for a benchmark task

Usage:
  node scripts/prepare.mjs --task <task.json> [options]
  node scripts/prepare.mjs --repo <key|url> [--commit <sha>] [options]

Options:
  --task <path>     BenchmarkTask JSON (its repo pin is used).
  --repo <key|url>  Key in repos.json, or a git URL. Required when --task is absent.
  --commit <sha>    Override the pinned 40-hex commit.
  --workdir <dir>   Explicit destination for the checkout.
  --refresh         Update the cached mirror before cloning (needs network).
  --apply-setup     Apply task.setup patch/commands (default: on when --task given).
  --no-setup        Do not apply task.setup.
  --json            Print a JSON result object instead of a human line.
  --help            Show this help and exit.

Exit codes: 0 success, 2 usage error, 1 git/filesystem failure.
`

export function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--json') out.json = true
    else if (a === '--refresh') out.refresh = true
    else if (a === '--apply-setup') out.applySetup = true
    else if (a === '--no-setup') out.applySetup = false
    else if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1]
      if (val === undefined || val.startsWith('--')) throw new UsageError(`Missing value for --${key}`)
      out[key] = val
      i++
    } else out._.push(a)
  }
  return out
}

export class UsageError extends Error {}

function fail(msg) {
  process.stderr.write(`prepare: ${msg}\n`)
  process.exit(1)
}

export function git(args, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const detail = (stderr || err.message || '').trim()
        reject(new Error(`git ${args.join(' ')} failed: ${detail}`))
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

export function slugify(value) {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 80) || 'repo'
}

function assertCommit(commit) {
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new UsageError(`commit must be a full 40-hex SHA, got: ${JSON.stringify(commit)}`)
  }
}

/** True when `dest` is the bench work root itself or lives under it. */
export function isBenchWorkdir(dest, benchRoot = BENCH_ROOT) {
  const workRoot = path.join(benchRoot, 'artifacts', 'work')
  const rel = path.relative(workRoot, dest)
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))
}

/**
 * Force an existing checkout to a pristine detached tree at `commit`.
 *
 * A matching `HEAD` is NOT evidence of cleanliness: the previous arm's edits and
 * a previously applied `task.setup` survive a HEAD-only check. Every arm must
 * therefore reset tracked files and remove untracked/ignored ones before setup
 * is applied, so all arms start from the identical pinned tree.
 *
 * Returns true when the reset succeeded in place. Returns false when `dest` has
 * no git checkout or the commit cannot be reset locally (caller re-clones).
 * Refuses to touch a checkout outside `bench/artifacts/work` (never reset a
 * user's real repository).
 */
export async function ensurePristineCheckout(dest, commit, { benchRoot = BENCH_ROOT } = {}) {
  if (!existsSync(path.join(dest, '.git'))) return false
  if (!isBenchWorkdir(dest, benchRoot)) {
    throw new Error(
      `refusing to reset a git checkout outside ${path.join(benchRoot, 'artifacts', 'work')}: ${dest}`,
    )
  }
  try {
    await git(['-C', dest, 'reset', '--hard', commit])
    await git(['-C', dest, 'clean', '-fdx'])
    return true
  } catch {
    return false
  }
}

export function resolveRepoFromOpts(opts, benchRoot) {
  let task = null
  let taskId = null
  if (opts.task) {
    task = readJson(path.resolve(opts.task))
    taskId = task.id
  }
  let repo = null
  if (task) repo = { ...task.repo }
  else if (opts.repo) {
    const reposFile = path.resolve(benchRoot, 'repos.json')
    if (existsSync(reposFile)) {
      const catalog = readJson(reposFile)
      if (catalog.repos && catalog.repos[opts.repo]) repo = { ...catalog.repos[opts.repo] }
    }
    if (!repo) repo = { url: opts.repo, commit: opts.commit, subdir: null }
  }
  if (!repo) throw new UsageError('provide --task or --repo')
  if (opts.commit) repo.commit = opts.commit
  assertCommit(repo.commit)
  if (!repo.url) throw new UsageError('repo.url is required')
  return { task, taskId, repo }
}

/**
 * Clone/checkout the pinned commit. Returns { workdir, root, url, commit, subdir, reused, cacheDir }.
 * `root` is the effective working directory the agent sees (workdir + subdir when set).
 *
 * Every call guarantees a pristine tree at `commit`: an existing checkout is
 * `git reset --hard` + `git clean -fdx`'d (never reused on a HEAD match alone),
 * and `task.setup` is applied exactly once afterward. `reused` means an existing
 * checkout was reset in place; it does not mean the tree was left untouched.
 */
export async function prepareTask({ repo, taskId, benchRoot = BENCH_ROOT, workdir, refresh = false, applySetup = true, task = null }) {
  assertCommit(repo.commit)
  const slug = slugify(repo.url)
  const cacheDir = path.join(benchRoot, 'artifacts', 'cache', `${slug}.git`)
  const dest = workdir
    ? path.resolve(workdir)
    : path.join(benchRoot, 'artifacts', 'work', taskId ? slugify(taskId) : `${slug}-${repo.commit.slice(0, 12)}`, 'repo')

  mkdirSync(path.join(benchRoot, 'artifacts', 'cache'), { recursive: true })
  if (!existsSync(cacheDir)) {
    mkdirSync(path.dirname(cacheDir), { recursive: true })
    await git(['clone', '--mirror', repo.url, cacheDir])
  } else if (refresh) {
    await git(['--git-dir', cacheDir, 'remote', 'update', '--prune'])
  }

  let reused = false
  if (existsSync(path.join(dest, '.git'))) {
    // Never trust HEAD alone: reset + clean so arm N-1's edits cannot leak into
    // this arm. Falls back to a fresh clone when the pinned commit is unavailable.
    reused = await ensurePristineCheckout(dest, repo.commit, { benchRoot })
  }

  if (!reused) {
    mkdirSync(path.dirname(dest), { recursive: true })
    if (existsSync(dest)) {
      // Only remove a destination we created under artifacts/work.
      if (!isBenchWorkdir(dest, benchRoot)) {
        throw new Error(`refusing to overwrite non-bench workdir: ${dest}`)
      }
      const { rmSync } = await import('node:fs')
      rmSync(dest, { recursive: true, force: true })
    }
    await git(['clone', '--no-checkout', cacheDir, dest])
    await git(['-C', dest, 'checkout', '--detach', repo.commit])
  }

  // Applied exactly once, on the pristine tree guaranteed above.
  if (task && task.setup && applySetup !== false) {
    await applyTaskSetup(task, dest)
  }

  const root = repo.subdir ? path.join(dest, repo.subdir) : dest
  return { workdir: dest, root, url: repo.url, commit: repo.commit, subdir: repo.subdir ?? null, reused, cacheDir }
}

export async function applyTaskSetup(task, workdir) {
  const setup = task.setup || {}
  const baseDir = task.__file ? path.dirname(task.__file) : workdir
  if (setup.patch) {
    const patchFile = path.resolve(baseDir, setup.patch)
    if (existsSync(patchFile)) {
      await git(['-C', workdir, 'apply', patchFile])
    } else {
      // Inline diff: execFile cannot feed stdin, so materialize it in a temp file.
      const { writeFileSync, mkdtempSync } = await import('node:fs')
      const os = await import('node:os')
      const tmp = mkdtempSync(path.join(os.tmpdir(), 'bench-patch-'))
      const file = path.join(tmp, 'setup.patch')
      writeFileSync(file, setup.patch)
      await git(['-C', workdir, 'apply', file])
    }
  }
  for (const cmd of setup.commands || []) {
    await new Promise((resolve, reject) => {
      execFile('/bin/sh', ['-c', cmd], { cwd: workdir, encoding: 'utf8' }, (err, _stdout, stderr) => {
        if (err) reject(new Error(`setup command failed (${cmd}): ${(stderr || err.message).trim()}`))
        else resolve()
      })
    })
  }
}

async function main() {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    process.stderr.write(`prepare: ${err.message}\n\n${USAGE}`)
    process.exit(2)
  }
  if (opts.help) {
    process.stdout.write(USAGE)
    process.exit(0)
  }
  try {
    const { task, taskId, repo } = resolveRepoFromOpts(opts, BENCH_ROOT)
    if (task) task.__file = path.resolve(opts.task)
    const result = await prepareTask({
      task,
      taskId,
      repo,
      workdir: opts.workdir,
      refresh: Boolean(opts.refresh),
      applySetup: opts.applySetup !== false,
    })
    if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    else process.stdout.write(`prepared ${result.root}${result.reused ? ' (reused)' : ''}\n`)
    process.exit(0)
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`prepare: ${err.message}\n\n${USAGE}`)
      process.exit(2)
    }
    fail(err.message)
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main()
