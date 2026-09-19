# dsh-code-index context-economy benchmark (infrastructure)

> **Status: skeleton, not a result.** Nothing in this directory has been run
> against a model. No token-savings percentage may be claimed from it yet.

This is the dependency-light, reproducible multi-arm benchmark for the
`dsh-code-index` 0.6 context-economy plan. It exists to answer one question
honestly:

> When an agent edits an existing repository, does `dsh-code-index` (especially
> its change-aware `code_change_context` workflow) let the same model finish the
> same task with less input context, **without** finishing fewer tasks?

Everything here is Node built-ins plus JSON. There is no framework, no npm
dependency, and `bench/` never modifies `package.json`.

- Design source: `.omo/plans/dsh-code-index-0.6-p0-1-design.md` section 5.
- Methodology source: `.omo/plans/dsh-code-index-0.6-strategy.md` sections 4 (P0-2) and 7.

---

## 1. Layout

```text
bench/
  README.md                       this file
  schema/task.schema.json         JSON Schema for BenchmarkTask
  schema/run.schema.json          JSON Schema for BenchmarkRun
  tasks/narrow/001-find-definition.json
  tasks/impact/001-change-parser.json
  repos.json                      pinned repo url+commit list used by tasks
  prompts/system.txt              system prompt handed to the agent
  prompts/task.txt                task wrapper template ({{PLACEHOLDERS}})
  scripts/prepare.mjs             clone/checkout pinned commit into a temp workdir
  scripts/run.mjs                 run one task x one arm -> BenchmarkRun + transcript + patch
  scripts/judge.mjs               run the task's deterministic judge.commands, pass/fail
  scripts/summarize.mjs           aggregate paired diffs per task-seed block across the arms
  scripts/bootstrap.mjs           seeded paired bootstrap, 95% percentile CI, records resample count
  arms/stock.json                 stock dsh (no plugin)
  arms/v0.5.json                  dsh + dsh-code-index 0.5.0
  arms/v0.6.json                  dsh + dsh-code-index 0.6.1 (local)
  arms/v0.7.json                  dsh + dsh-code-index 0.7.0 (local)
  artifacts/.gitkeep              generated work dirs, caches, runs, patches, transcripts
```

`artifacts/` is generated output. It is not meant to be committed; add it to a
local ignore rule or pass `--out` / `--runs` elsewhere. This skeleton keeps the
tree exactly as specified, so no extra `.gitignore` is shipped.

---

## 2. The arms

Every arm pins the same harness and differs only in the plugin under test. The
pins live in `arms/*.json` and are copied into every run record, so a record can
never be silently attributed to a different build.

| Arm | Harness (pinned) | Plugin | Purpose |
|---|---|---|---|
| `stock` | dsh `0.1.0-rc.8` | none | control: built-in glob/grep/read/LSP only |
| `v0.5` | dsh `0.1.0-rc.8` | `dsh-code-index@0.5.0` (npm, exact) | published baseline |
| `v0.6` | dsh `0.1.0-rc.8` | local `dsh-code-index` 0.6.1 build (`file:../..`) | change-aware treatment |
| `v0.7` | dsh `0.1.0-rc.8` | local `dsh-code-index` 0.7.0 build (`file:../..`) | task-aware treatment |

Placeholders you must resolve before a real campaign:

- **dsh version** is pinned to the `@deepseek-ai/dsh-tools` version in this
  repository's `devDependencies` (`0.1.0-rc.8`). Confirm with `dsh --version` and
  record the observed value; the run record stores the pin, not a guess.
- **`v0.5` tarball sha256** and **`v0.6` built `dist/` hash** are `null` in the
  arm files. Record them before you trust cross-machine reproducibility.
- The **wrapper contract** in section 5 is intentionally not a real dsh CLI:
  the bench does not invent flags. You provide a thin wrapper.

---

## 3. Tasks and the schemas

A task is one JSON object matching `schema/task.schema.json`:

```jsonc
{
  "id": "narrow-001-find-definition",
  "category": "narrow-lookup",
  "repo": { "url": "https://github.com/json5/json5.git", "commit": "<40-hex>" },
  "prompt": "...",
  "setup": { "patch": null, "commands": [] },   // optional
  "budget": { "maxTurns": 12, "maxToolCalls": 30, "timeoutMs": 300000 },
  "judge": {
    "commands": ["sh -c command, exit 0 = pass"],
    "requiredFiles": [], "forbiddenFiles": [],
    "expectedSymbols": ["parse"], "expectedTests": ["test/parse.js"]
  },
  "exclusions": ["..."]
}
```

A run record matches `schema/run.schema.json` and stores, at minimum: `runId`,
`blockId`, `taskId`, `category`, `armId`, `seed`, `repo{url,commit,subdir}`,
`model`, `temperature`, `dshVersion`, `pluginVersion`, `startedAt`/`finishedAt`/
`wallMs`, `tokens{input,output,cached,reasoning,source}`, `toolCalls`, `turns`,
`pluginContextChars`, `exitCode`, `timedOut`, `excluded`, `exclusionReason`,
`success`, `judgeResults[]`, `transcriptPath`, `patchPath`, `notes`.

**Token honesty rule.** If the provider does not report a count, the field is
`null`. It is never defaulted to `0`, never estimated from bytes, and the run's
`notes` records which fields were missing. `summarize.mjs` counts null-token runs
(`nullTokenRuns`) instead of pretending they are zero.

### Shipped sample tasks

Both sample tasks pin **`json5/json5` at commit
`b935d4a280eafa8835e6182551b63809e61243b0`** (verified via the GitHub REST API
on 2026-09-14; the tarball was downloaded and `lib/parse.js` inspected). This is
a real SHA, not a placeholder.

- `tasks/narrow/001-find-definition.json` -- **narrow-lookup**: locate an internal
  parser helper (`internalize`) and rename it at its one definition and one call
  site. Deterministic judges: `git grep` for the new/old name plus two
  `node -e` behavior checks (including the reviver path).
- `tasks/impact/001-change-parser.json` -- **broad-change-impact**: change the
  JSON5 parser so duplicate object keys throw `SyntaxError`, nested included,
  with valid-input behavior unchanged. Deterministic judges: four `node -e`
  checks against `require('./lib')` (duplicate at top level, duplicate nested,
  valid nested input unchanged, `stringify` untouched).

- `tasks/architecture/001-parser-flow-notes.json` -- **architecture**: trace the
  public parse entry point, lexer/tokenizer, parser, and reviver traversal into a
  constrained maintainer note.
- `tasks/test-fix/001-duplicate-key-regression-test.json` -- **test-fix**: add a
  focused regression contract for duplicate keys without changing runtime code.

The shipped set now covers narrow lookup, broad change/feature work, repository
architecture understanding, and test-fix work. The deterministic judges are
task-specific; no model completion or token result is inferred from task
definitions alone.

Neither sample ships `setup`; both rely only on the pinned checkout. The judge
commands deliberately do **not** use the target repo's test runner because the
repo's devDependencies (`tap`, `sinon`) are not installed and the bench does not
install packages. This is a documented limitation, not a claim that the repo
suite passed.

---

## 4. Methodology

**Unit of comparison: the matched task-seed block.** A block is one task run at
one seed. The same block is executed by all configured arms. A block is **matched
(comparable)** only when all configured arms are present *and* no present arm was
excluded, timed out, or hit a harness error; only matched blocks enter the
aggregates and the block-count gate. Arm comparisons are only ever made *within*
a block; across-block variation is absorbed by pairing.

Rules that keep the arms comparable:

1. Same task prompt, same pinned `repo.commit`, and a **pristine working tree
   before every arm**: `prepare.mjs` runs `git reset --hard <commit>` +
   `git clean -fdx` on any existing checkout (a matching `HEAD` is never accepted
   as evidence of cleanliness) and then applies `task.setup` exactly once. No arm
   inherits another arm's edits.
2. Same budgets per task (`maxTurns`/`maxToolCalls`/`timeoutMs`) across arms.
3. Same model and temperature across arms (recorded per run). The pilot should
   also repeat seeds so sampling noise is visible.
4. Fresh session per run; no shared cache, no carry-over transcript.
5. The arm is the only difference: same harness pin, different plugin only.
6. A run is **excluded** (and the reason recorded) only for infrastructure
   failures listed in the task's `exclusions` -- a failed clone, a missing
   transcript with no result JSON. Model failures are never excluded; a failed
   judge is a *matched, unsuccessful* run. A **timed-out run or a harness error**
   (no exit code recorded) makes the whole block **non-comparable**: the block is
   reported separately with its reason and kept out of the token/success
   aggregates and out of the block-count gate rather than scored.
7. Completion rate is **always** reported next to tokens. Saving tokens while
   completing fewer tasks is a failed treatment.

### Pilot size: >= 30 matched task-seed blocks across all configured arms

The pilot decision threshold is **>= 30 matched blocks** (strategy P0-2). With
3 seeds that means **>= 10 tasks x 3 seeds**, balanced across categories and
run for every configured arm:

| Slot | Category | Task | Status |
|---|---|---|---|
| 1 | narrow-lookup | `narrow-001-find-definition` (json5) | shipped |
| 2 | broad-change-impact | `impact-001-change-parser` (json5) | shipped |
| 3 | architecture | `architecture-001-parser-flow-notes` | shipped |
| 4 | test-fix | `test-fix-001-duplicate-key-regression-test` | shipped |
| 5 | feature-implementation | to add | planned |
| 6 | broad-change-impact | to add | planned |
| 7 | narrow-lookup | to add | planned |
| 8 | broad-change-impact | to add | planned |
| 9 | feature-implementation | to add | planned |
| 10 | test-fix | to add | planned |

That is 10 tasks x 3 seeds = **30 matched blocks**. With the four configured
arms this is **120 runs**.
Additional tasks and/or more seeds are added until the publishing gate (60
matched blocks) is met; more repos go into `repos.json` with full-SHA pins.

### Claim gates

- **>= 30 matched blocks** -- enough to make an internal keep/kill decision.
- **>= 60 matched blocks** -- required before any *public percentage* claim is
  made (the line used by leantoken / GraphFlow).
- Only **matched** blocks count toward either gate. Excluded, timed-out,
  harness-error, and incomplete blocks are reported separately with reasons and
  never inflate the denominator.
- Until 60 matched blocks: report raw matched-block counts, completion rates,
  and intervals only; never a headline percentage.
- Always show completion rate beside tokens, plus exclusions and null-token
  counts, so a reader can audit the denominator.

`summarize.mjs` encodes these gates in `claimGate.{decisionBlocks,
publishBlocks, mayDecide, mayPublishPercent}`.

---

## 5. Running the pilot

Prerequisites: Node >= 22 and `git` on `PATH`. Real runs need network access to
clone the pinned commit and a dsh wrapper (see below). `--help` and `--dry-run`
need neither.

### 5a. The dsh wrapper contract

`run.mjs` shells out with `child_process.execFile` to a command resolved in this
order:

1. `--cmd <executable>`
2. `$DSH_CMD`
3. `arm.dsh.command` (default `dsh`)

If none resolves, `run.mjs` **fails loudly** and refuses to record a run. It
never fabricates token counts.

Because the bench does not hardcode dsh's CLI, the wrapper reads everything it
needs from the environment:

| Variable | Meaning |
|---|---|
| `DSH_BENCH_ARM` | arm id (`stock` / `v0.5` / `v0.6` / `v0.7`) |
| `DSH_BENCH_TASK` | task id |
| `DSH_BENCH_BLOCK_ID` | `<taskId>::seed=<seed>` |
| `DSH_BENCH_RUN_ID` | `<taskId>::<armId>::seed=<seed>` |
| `DSH_BENCH_SEED` | seed |
| `DSH_BENCH_WORKDIR` | the prepared checkout (also the exec cwd) |
| `DSH_BENCH_PROMPT_FILE` | assembled prompt (system + task wrapper + prompt) |
| `DSH_BENCH_SYSTEM_FILE` | `prompts/system.txt` |
| `DSH_BENCH_TASK_FILE` | the task JSON |
| `DSH_BENCH_RESULT_FILE` | where the wrapper MUST write its result JSON |
| `DSH_BENCH_TRANSCRIPT_FILE` | optional path the wrapper may also write |
| `DSH_BENCH_OUT_DIR` | the run output directory |
| `DSH_BENCH_MODEL` | model label |

The wrapper should write `DSH_BENCH_RESULT_FILE` as JSON. Recognized keys:

```jsonc
{
  "model": "...", "temperature": 0, "turns": 7, "toolCalls": 12,
  "pluginContextChars": 3400,
  "tokens": { "input": 12345, "output": 800, "cached": 0, "reasoning": null, "source": "provider-usage" }
}
```

Any token key the provider does not report must be omitted or `null`; `run.mjs`
records `null` and adds a note. `argv` for the wrapper can be supplied with
`--args-json` / `$DSH_ARGS_JSON` or `arm.dsh.args`, with `{workdir}`,
`{promptFile}`, `{systemFile}`, `{taskFile}`, `{resultFile}`, `{transcriptFile}`,
`{outDir}`, `{runDir}`, `{seed}`, `{model}`, `{arm}` substituted.

### 5b. Commands

```bash
# 1. prepare a pristine pinned checkout for a task (reset+clean, then setup once)
node scripts/prepare.mjs --task tasks/narrow/001-find-definition.json --json

# 2. dry-run: print the resolved invocation and paths, run nothing, write nothing
node scripts/run.mjs --task tasks/narrow/001-find-definition.json --arm v0.7 --seed 1 --dry-run

# 3. real run (requires a working wrapper)
DSH_CMD=/path/to/dsh-wrapper node scripts/run.mjs \
  --task tasks/narrow/001-find-definition.json --arm v0.7 --seed 1

# 4. judge a prepared workdir on its own
node scripts/judge.mjs --task tasks/narrow/001-find-definition.json --workdir artifacts/work/<task>/repo --json

# 5. aggregate all runs into paired diffs per block
node scripts/summarize.mjs --json

# 6. paired bootstrap CI over the matched blocks
node scripts/bootstrap.mjs --iterations 10000 --seed 42
```

Run all configured arms per block (loop `--arm stock`, `--arm v0.5`, `--arm v0.6`, `--arm v0.7`) to
form a matched block. Each arm is reset to the pinned commit before it starts, so
no arm inherits edits from the previous one. Only matched blocks enter the
comparison; a block whose arm was excluded, timed out, or errored is reported
separately and does not count toward the gate.

### 5c. What each script does

- **`prepare.mjs`** -- resolves the repo pin from the task or `repos.json`, keeps
  a cached `git clone --mirror` under `artifacts/cache/`, clones it into
  `artifacts/work/<task>/repo` with `--no-checkout`, checks out the pinned commit
  detached, and applies `task.setup` (patch via `git apply`, then commands).
  Before every arm it guarantees a pristine tree: an existing checkout is reset
  with `git reset --hard <commit>` and cleaned with `git clean -fdx` (a matching
  `HEAD` is not accepted as evidence of cleanliness), then `task.setup` is applied
  exactly once. A checkout outside `artifacts/work` is never reset or
  overwritten. Git is always invoked through `execFile('git', [args])` -- never a
  shell string.
- **`run.mjs`** -- prepares the workdir to a pristine pinned state (or, with an
  explicit `--workdir`, resets that checkout the same way and applies `task.setup`
  once), assembles the prompt from `prompts/system.txt` + `prompts/task.txt`,
  invokes the wrapper with `execFile(command, args)`, writes the transcript
  (stdout+stderr+metadata) and a patch (`git add -N .` then `git diff --binary`,
  then unstage), reads the wrapper result JSON, runs the judge, and writes
  `*.run.json`.
- **`judge.mjs`** -- runs each `judge.commands` entry through `/bin/sh -c` in the
  workdir (exit 0 = pass), then checks `requiredFiles` / `forbiddenFiles`.
  First failure short-circuits. Exports `runJudge()` for reuse.
- **`summarize.mjs`** -- reads `*.run.json`, groups by `blockId`, and marks a
  block matched only when all configured arms are present **and** no present arm was
  excluded, timed out, or a harness error. Excluded blocks are reported
  separately with their reasons and kept out of the token/success aggregates and
  the block-count gate; incomplete blocks (missing arms) are likewise reported.
  Computes per-arm medians and success rates over matched blocks and paired
  diffs for each configured treatment/baseline pair for input tokens and success.
  Writes `artifacts/summary.json` and encodes the gates.
- **`bootstrap.mjs`** -- consumes `summary.json` and runs the paired bootstrap
  described below.

### 5d. Statistical method (`bootstrap.mjs`)

Non-parametric **paired** bootstrap over matched blocks:

1. For each treatment/baseline pair, build per-block differences
   (`treat - baseline`) for input tokens (median estimator) and success
   (mean estimator).
2. Resample the block indices **with replacement** and apply the same resampled
   indices to both arms -- the pairing is preserved.
3. Recompute the median input-token difference and the success-rate difference
   on each resample.
4. Report the point estimate on the full sample and the 95% percentile interval
   as the **2.5 / 97.5** percentiles of the resample distribution.
5. The PRNG (mulberry32) is seeded (default `42`) and the exact number of
   resamples is printed per metric (`resampleCount`, default `10000`).
6. Blocks with a null input-token count on either arm are dropped from the token
   metric; the count dropped is reported as `droppedNullTokenBlocks`.

Because the same indices resample both arms, the interval reflects paired
differences, not two independent samples.

---

## 6. Reproducibility notes and placeholders

Verified and real:

- `json5/json5` commit `b935d4a280eafa8835e6182551b63809e61243b0` -- resolved via
  the GitHub REST API and downloaded on 2026-09-14; the `lib/parse.js` locations
  used by the judge commands were confirmed against that tarball.
- All judge commands are deterministic and self-contained (`git grep`,
  `node -e` against `./lib`).

Placeholders / to resolve before a campaign:

- `dsh` version `0.1.0-rc.8` is taken from this repo's devDependencies, not from
  an observed `dsh --version`. Confirm and update per arm.
- `v0.5` npm tarball and local `dist/` hashes are `null` until a campaign records
  the exact artifacts.
- The wrapper CLI is a documented contract, not a verified dsh flag surface.
- Only 2 of the >= 10 tasks exist; upload the remaining 8 (section 4) before
  claiming a pilot, and add their repos to `repos.json` with full-SHA pins.

Non-goals (inherited from the strategy scope guardrails): no embeddings, no LSP
client, no database, no watcher, no new language support, no extra runtime
dependencies, no result is invented and no model was run to produce this
skeleton.
