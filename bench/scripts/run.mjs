#!/usr/bin/env node
// run.mjs - execute one benchmark task against one arm at one seed.
//
// Usage:
//   DSH_CMD=/path/to/dsh-wrapper node scripts/run.mjs \
//     --task tasks/narrow/001-find-definition.json --arm v0.6 --seed 1
//
// The dsh invocation is shelled out with child_process.execFile to a command
// resolved from --cmd, then $DSH_CMD, then arm.dsh.command. If none resolves,
// the script fails loudly rather than fabricate a run. The wrapper is told where
// to find the assembled prompt and where to write its result JSON through the
// DSH_BENCH_* environment variables. When the wrapper does not report token
// counts those fields are recorded as null and a note is added; they are never
// guessed.

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { BENCH_ROOT, git, prepareTask, readJson, slugify, UsageError, ensurePristineCheckout, applyTaskSetup } from './prepare.mjs'
import { runJudge } from './judge.mjs'

const USAGE = `run.mjs - run one task x one arm, write a BenchmarkRun record

Usage:
  node scripts/run.mjs --task <task.json> --arm <id|path> --seed <n> [options]

Options:
  --task <path>       BenchmarkTask JSON (required).
  --arm <id|path>     Arm id under arms/ (stock, v0.5, v0.6) or a path to an arm JSON (required).
  --seed <n>          Seed for this matched block (default 1).
  --workdir <dir>     Reuse an already-prepared workdir instead of preparing one.
  --out <dir>         Run output root (default bench/artifacts/runs).
  --cmd <executable>  dsh executable. Overrides $DSH_CMD and arm.dsh.command.
  --args-json <json>  JSON array of argv for dsh. Overrides $DSH_ARGS_JSON and arm.dsh.args.
  --model <name>      Model label recorded in the run.
  --temperature <n>   Temperature recorded in the run.
  --refresh           Refresh the git mirror before preparing.
  --dry-run           Resolve and print the invocation without running dsh or writing files.
  --json              Print the run record as JSON (always on when writing).
  --help              Show this help and exit.

Exit codes: 0 run recorded, 2 usage/config error, 1 infrastructure failure.
`

export function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--json') out.json = true
    else if (a === '--refresh') out.refresh = true
    else if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1]
      if (val === undefined || val.startsWith('--')) throw new UsageError(`Missing value for --${key}`)
      out[key] = val
      i++
    } else out._ = [...(out._ || []), a]
  }
  return out
}

export function fsSafe(value) {
  return value.replace(/[^a-zA-Z0-9._=-]+/g, '_').replace(/^_+|_+$/g, '') || 'run'
}

export function loadArm(armArg, benchRoot) {
  const asPath = path.resolve(armArg)
  if (existsSync(asPath) && asPath.endsWith('.json')) return readJson(asPath)
  const file = path.join(benchRoot, 'arms', `${armArg}.json`)
  if (!existsSync(file)) throw new UsageError(`arm not found: ${armArg} (looked for ${file})`)
  return readJson(file)
}

export function resolveCommand(opts, arm) {
  const command = opts.cmd || process.env.DSH_CMD || (arm && arm.dsh && arm.dsh.command) || ''
  if (!command || typeof command !== 'string' || !command.trim()) {
    throw new UsageError(
      'no dsh command configured. Pass --cmd, set DSH_CMD, or set dsh.command in the arm config. ' +
        'Refusing to fabricate a run without a real harness command.',
    )
  }
  if (/\s/.test(command.trim())) {
    throw new UsageError(`dsh command must be a single executable, got: ${JSON.stringify(command)}`)
  }
  const source = opts.cmd ? '--cmd' : process.env.DSH_CMD ? 'DSH_CMD' : 'arm.dsh.command'
  return { command: command.trim(), source }
}

export function resolveArgs(opts, arm) {
  const raw = opts['args-json'] || process.env.DSH_ARGS_JSON || null
  if (raw) {
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new UsageError('--args-json / DSH_ARGS_JSON is not valid JSON')
    }
    if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== 'string')) {
      throw new UsageError('--args-json / DSH_ARGS_JSON must be a JSON array of strings')
    }
    return parsed
  }
  const fromArm = (arm && arm.dsh && arm.dsh.args) || []
  if (!Array.isArray(fromArm)) throw new UsageError('arm.dsh.args must be an array')
  return [...fromArm]
}

export function substituteArgv(argv, vars) {
  return argv.map((arg) => arg.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m)))
}

export function fillTemplate(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (m, key) => (key in vars ? String(vars[key]) : m))
}

function runOnce(command, args, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const startedAt = new Date()
    execFile(
      command,
      args,
      { cwd, env, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const finishedAt = new Date()
        const timedOut = Boolean(err && err.killed)
        const exitCode = err ? (typeof err.code === 'number' ? err.code : 1) : 0
        resolve({
          stdout: stdout || '',
          stderr: stderr || '',
          exitCode,
          timedOut,
          error: err ? String(err.message || err) : null,
          startedAt,
          finishedAt,
        })
      },
    )
  })
}

export function buildSystemPrompt(benchRoot, vars) {
  const systemFile = path.join(benchRoot, 'prompts', 'system.txt')
  const taskFile = path.join(benchRoot, 'prompts', 'task.txt')
  const system = readFileSync(systemFile, 'utf8')
  const taskTemplate = readFileSync(taskFile, 'utf8')
  return fillTemplate(`${system}\n\n${taskTemplate}`, vars)
}

export async function collectPatch(workdir, { gitRun }) {
  try {
    await gitRun(['-C', workdir, 'add', '-N', '.'])
    const { stdout } = await gitRun(['-C', workdir, 'diff', '--binary'])
    await gitRun(['-C', workdir, 'reset', '-q'])
    return stdout || ''
  } catch {
    return ''
  }
}

export function readWrapperResult(resultFile) {
  const notes = []
  if (!existsSync(resultFile)) {
    return {
      model: null,
      temperature: null,
      toolCalls: null,
      turns: null,
      pluginContextChars: null,
      exitCodeOverride: null,
      tokens: { input: null, output: null, cached: null, reasoning: null, source: null },
      notes: ['wrapper wrote no result JSON; token/tool counts unavailable'],
    }
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(resultFile, 'utf8'))
  } catch (err) {
    return {
      model: null,
      temperature: null,
      toolCalls: null,
      turns: null,
      pluginContextChars: null,
      exitCodeOverride: null,
      tokens: { input: null, output: null, cached: null, reasoning: null, source: null },
      notes: [`wrapper result JSON was unreadable: ${err.message}`],
    }
  }
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const tokensIn = parsed.tokens || parsed.usage || {}
  const tokens = {
    input: num(tokensIn.input ?? tokensIn.inputTokens ?? tokensIn.prompt_tokens),
    output: num(tokensIn.output ?? tokensIn.outputTokens ?? tokensIn.completion_tokens),
    cached: num(tokensIn.cached ?? tokensIn.cachedTokens ?? tokensIn.cached_tokens),
    reasoning: num(tokensIn.reasoning ?? tokensIn.reasoningTokens ?? tokensIn.reasoning_tokens),
    source: typeof tokensIn.source === 'string' ? tokensIn.source : 'wrapper result JSON',
  }
  for (const [key, value] of Object.entries(tokens)) {
    if (key !== 'source' && value === null) notes.push(`token field '${key}' not reported by provider`)
  }
  return {
    model: typeof parsed.model === 'string' ? parsed.model : null,
    temperature: num(parsed.temperature),
    toolCalls: num(parsed.toolCalls ?? parsed.tool_calls),
    turns: num(parsed.turns),
    pluginContextChars: num(parsed.pluginContextChars ?? parsed.plugin_context_chars),
    exitCodeOverride: num(parsed.exitCode),
    tokens,
    notes,
  }
}

export async function main(argv) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (err) {
    process.stderr.write(`run: ${err.message}\n\n${USAGE}`)
    return 2
  }
  if (opts.help) {
    process.stdout.write(USAGE)
    return 0
  }
  try {
    if (!opts.task) throw new UsageError('--task is required')
    if (!opts.arm) throw new UsageError('--arm is required')
    const seed = opts.seed === undefined ? 1 : Number(opts.seed)
    if (!Number.isInteger(seed) || seed < 0) throw new UsageError('--seed must be a non-negative integer')

    const task = readJson(path.resolve(opts.task))
    task.__file = path.resolve(opts.task)
    const arm = loadArm(opts.arm, BENCH_ROOT)
    const { command, source: cmdSource } = resolveCommand(opts, arm)
    const argvForDsh = resolveArgs(opts, arm)

    const blockId = `${task.id}::seed=${seed}`
    const runId = `${task.id}::${arm.id}::seed=${seed}`
    const outRoot = path.resolve(opts.out || path.join(BENCH_ROOT, 'artifacts', 'runs'))
    const runDir = path.join(outRoot, fsSafe(blockId))

    const transcriptPath = path.join(runDir, `${fsSafe(arm.id)}.transcript.txt`)
    const patchPath = path.join(runDir, `${fsSafe(arm.id)}.patch`)
    const resultFile = path.join(runDir, `${fsSafe(arm.id)}.result.json`)
    const promptFile = path.join(runDir, `${fsSafe(arm.id)}.prompt.txt`)
    const recordPath = path.join(runDir, `${fsSafe(arm.id)}.run.json`)

    const subdirLabel = task.repo.subdir || '(repo root)'
    const templateVars = {
      TASK_ID: task.id,
      CATEGORY: task.category,
      REPO_URL: task.repo.url,
      REPO_COMMIT: task.repo.commit,
      SUBDIR: subdirLabel,
      MAX_TURNS: task.budget.maxTurns,
      MAX_TOOL_CALLS: task.budget.maxToolCalls,
      TIMEOUT_MS: task.budget.timeoutMs,
      PROMPT: task.prompt,
    }
    const promptText = buildSystemPrompt(BENCH_ROOT, templateVars)

    const model = opts.model || process.env.DSH_MODEL || null
    const temperature = opts.temperature !== undefined ? Number(opts.temperature) : null
    const dshEnv = {
      ...process.env,
      ...(arm.env || {}),
      DSH_BENCH_ARM: arm.id,
      DSH_BENCH_TASK: task.id,
      DSH_BENCH_BLOCK_ID: blockId,
      DSH_BENCH_RUN_ID: runId,
      DSH_BENCH_SEED: String(seed),
      DSH_BENCH_WORKDIR: '',
      DSH_BENCH_OUT_DIR: runDir,
      DSH_BENCH_PROMPT_FILE: promptFile,
      DSH_BENCH_SYSTEM_FILE: path.join(BENCH_ROOT, 'prompts', 'system.txt'),
      DSH_BENCH_TASK_FILE: path.resolve(opts.task),
      DSH_BENCH_RESULT_FILE: resultFile,
      DSH_BENCH_TRANSCRIPT_FILE: transcriptPath,
      DSH_BENCH_MODEL: model || '',
    }

    if (opts.dryRun) {
      const workdir = opts.workdir
        ? path.resolve(opts.workdir)
        : path.join(BENCH_ROOT, 'artifacts', 'work', slugify(task.id), 'repo')
      dshEnv.DSH_BENCH_WORKDIR = workdir
      const vars = { ...templateVars, workdir, promptFile, systemFile: dshEnv.DSH_BENCH_SYSTEM_FILE, taskFile: dshEnv.DSH_BENCH_TASK_FILE, resultFile, transcriptFile: transcriptPath, outDir: runDir, runDir, seed, model: model || '', arm: arm.id }
      const resolvedArgv = substituteArgv(argvForDsh, vars)
      process.stdout.write(
        JSON.stringify(
          {
            dryRun: true,
            runId,
            blockId,
            arm: arm.id,
            command,
            commandSource: cmdSource,
            args: resolvedArgv,
            cwd: workdir,
            env: {
              DSH_BENCH_ARM: dshEnv.DSH_BENCH_ARM,
              DSH_BENCH_PROMPT_FILE: promptFile,
              DSH_BENCH_RESULT_FILE: resultFile,
              DSH_BENCH_WORKDIR: workdir,
            },
            paths: { runDir, transcriptPath, patchPath, resultFile, promptFile, recordPath },
            note: 'dry run: dsh not invoked and no files written; prepare.mjs would clone the pinned commit to cwd',
          },
          null,
          2,
        ) + '\n',
      )
      return 0
    }

    // Prepare the workdir before writing anything so a clone failure is not a run.
    let workdir
    if (opts.workdir) {
      workdir = path.resolve(opts.workdir)
      if (!existsSync(workdir)) throw new Error(`--workdir does not exist: ${workdir}`)
      if (!existsSync(path.join(workdir, '.git'))) throw new Error(`--workdir is not a git checkout: ${workdir}`)
      // Reusing a workdir must still guarantee the arm's pristine starting tree:
      // reset + clean, then apply setup exactly once (same contract as prepareTask).
      const pristine = await ensurePristineCheckout(workdir, task.repo.commit, { benchRoot: BENCH_ROOT })
      if (!pristine) throw new Error(`could not reset --workdir to ${task.repo.commit}: ${workdir}`)
      if (task.setup) await applyTaskSetup(task, workdir)
    } else {
      const prepared = await prepareTask({
        task,
        taskId: task.id,
        repo: task.repo,
        benchRoot: BENCH_ROOT,
        refresh: Boolean(opts.refresh),
        applySetup: true,
      })
      workdir = prepared.root
    }
    const gitRun = (args) => git(args)
    dshEnv.DSH_BENCH_WORKDIR = workdir

    mkdirSync(runDir, { recursive: true })
    writeFileSync(promptFile, promptText)

    const vars = { ...templateVars, workdir, promptFile, systemFile: dshEnv.DSH_BENCH_SYSTEM_FILE, taskFile: dshEnv.DSH_BENCH_TASK_FILE, resultFile, transcriptFile: transcriptPath, outDir: runDir, runDir, seed, model: model || '', arm: arm.id }
    const resolvedArgv = substituteArgv(argvForDsh, vars)

    const exec = await runOnce(command, resolvedArgv, {
      cwd: workdir,
      env: dshEnv,
      timeoutMs: task.budget.timeoutMs,
    })

    const transcript = [
      `# run ${runId}`,
      `# command: ${command} ${resolvedArgv.join(' ')}`,
      `# cwd: ${workdir}`,
      `# started: ${exec.startedAt.toISOString()}`,
      `# finished: ${exec.finishedAt.toISOString()}`,
      `# exit: ${exec.exitCode}${exec.timedOut ? ' (timed out)' : ''}`,
      exec.error ? `# error: ${exec.error}` : null,
      '',
      '## stdout',
      exec.stdout,
      '',
      '## stderr',
      exec.stderr,
      '',
    ]
      .filter((line) => line !== null)
      .join('\n')
    writeFileSync(transcriptPath, transcript)

    const patch = await collectPatch(workdir, { gitRun })
    writeFileSync(patchPath, patch)

    const wrapper = readWrapperResult(resultFile)
    const judge = await runJudge({ task, workdir, timeoutMs: 120000 })

    const excluded = false
    const success = judge.passed && exec.exitCode === 0 && !exec.timedOut && !excluded

    const notes = [...wrapper.notes]
    if (exec.timedOut) notes.push(`dsh exceeded timeoutMs=${task.budget.timeoutMs}`)
    if (exec.error && !exec.timedOut) notes.push(`dsh error: ${exec.error}`)
    if (wrapper.tokens.input === null) notes.push('input token count is null (not invented)')

    const record = {
      runId,
      blockId,
      taskId: task.id,
      category: task.category,
      armId: arm.id,
      seed,
      repo: { url: task.repo.url, commit: task.repo.commit, subdir: task.repo.subdir ?? null },
      model: wrapper.model || model,
      temperature: wrapper.temperature ?? temperature,
      dshVersion: (arm.dsh && arm.dsh.version) || null,
      pluginVersion: (arm.plugins && arm.plugins[0] && arm.plugins[0].version) || null,
      startedAt: exec.startedAt.toISOString(),
      finishedAt: exec.finishedAt.toISOString(),
      wallMs: exec.finishedAt.getTime() - exec.startedAt.getTime(),
      tokens: wrapper.tokens,
      toolCalls: wrapper.toolCalls,
      turns: wrapper.turns,
      pluginContextChars: wrapper.pluginContextChars,
      exitCode: exec.exitCode,
      timedOut: exec.timedOut,
      excluded,
      exclusionReason: null,
      success,
      judgeResults: judge.results,
      transcriptPath,
      patchPath,
      notes: notes.join('; '),
    }

    writeFileSync(recordPath, JSON.stringify(record, null, 2) + '\n')
    process.stdout.write(JSON.stringify(record, null, 2) + '\n')
    return 0
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`run: ${err.message}\n\n${USAGE}`)
      return 2
    }
    process.stderr.write(`run: ${err.stack || err.message}\n`)
    return 1
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) main(process.argv.slice(2)).then((code) => process.exit(code))
