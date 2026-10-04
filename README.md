# dsh-code-index

[![npm version](https://img.shields.io/npm/v/dsh-code-index)](https://www.npmjs.com/package/dsh-code-index)
[![CI](https://github.com/lemonxiny55/dsh-code-index/actions/workflows/ci.yml/badge.svg)](https://github.com/lemonxiny55/dsh-code-index/actions)

English | [中文](README.zh.md)

**v0.9.0 — Edit-ready Context Packs**

Give your [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) agent the bounded source context it needs to start a code task. One `code_context` call selects primary declarations, strong callers/callees, imports, current changes, and likely tests, with exact source ranges and reasons for inclusion. When evidence is missing, the pack says so.

- **Source within budget:** complete declarations, then whole-line windows, then explicit signature-only fallback. Overlapping source lines are deduplicated; current and baseline excerpts stay separate.
- **One selected pack:** text and opt-in structured output consume the same final ContextPack. Both stay within the default 5000-character cap.
- **Evidence you can inspect:** inclusion reasons are separate from `exact` / `import-scoped` / `name-only` relationship provenance. No probability or confidence estimate is invented.
- **Local and current:** isolated repo/worktree indexes, external add/change/delete freshness, no external indexing API key. Existing full/compact surfaces and v0.8 configuration remain supported.

This checkout contains the v0.9 release candidate. It has not been published; an npm install still receives the latest published version. See [release evidence](RELEASE_EVIDENCE_v0.9.0.md).

## On this page

- [🚀 Quick start](#quick-start)
- [🧭 Project isolation and live updates](#project-isolation-and-live-updates)
- [👀 See it in action](#see-it-in-action)
- [🧰 Tools](#tools)
- [Configuration](#configuration)
- [Supported languages](#supported-languages)
- [How it works](#how-it-works)
- [Known limitations](#known-limitations)
- [Feedback](#feedback)

## Quick start

Requires Node 22/24 and a matching DSH `0.2.0-rc.2` host group. For this unreleased checkout, build and install locally from the repository root:

```sh
pnpm install
pnpm build
npx @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add .
npx @deepseek-ai/dsh@0.2.0-rc.2 web
```

Use the published-package command in [Install](#install) only when you intend to install the registry version, with its matching host.

## Project isolation and live updates

```text
Open repo A → search finds A's symbols
Switch to repo B → search finds B's symbols, not A's
Edit files outside DSH → the next query sees the change
Switch back to A → A's context is still isolated
```

Each Git worktree gets its own index and change state. The plugin watches projects accessed by the session and checks file metadata on tool calls, so additions, edits, and deletions become visible without a manual rebuild.

## See it in action

[30-second recorded demo](assets/context-pack-demo.html) · [terminal recording](assets/context-pack-demo.cast)

Download the HTML replay and open it locally, or play the cast with an asciinema-compatible player. Reproduce with `pnpm build`, then `node scripts/context-pack-demo.mjs`. The recording uses actual local tool calls in a tiny Git repository; it does not claim an Agent task-success or performance benchmark.

`code_context({ task: "Explain loadConfig", budgetChars: 5000 })` returns source immediately. An excerpt from the recorded call:

```text
primary: loadConfig src/config.ts:1-3 [current]
Reason: task names this symbol
Source (complete):
export function loadConfig(input: string) {
  return input.trim()
}
```

The demo then makes an external edit, shows added/modified/deleted declarations with separate current/base source, and requests a 500-character pack. Web Context Card is deferred until real Agent execution, replay, and file navigation can be verified on the matching RC. The existing text presentation remains usable.

## Tools

| Tool | Purpose |
|---|---|
| `code_index` | Status / (re)build the index for the current workspace |
| `code_symbols` | List symbols (functions, classes, interfaces, types, methods…) with file:line — filtered by name, path, kind, exported |
| `code_search` | Ranked lookup: exact > prefix > substring > subsequence-fuzzy, exports first, relevance score + file:line |
| `code_map` | Bounded ranked repo map (top files by symbol density + import-graph PageRank, key symbols + lines) |
| `code_refs` | Trace a symbol through the call graph: callers (who calls it) and callees (what it calls), resolved to file:line |
| `code_change_context` | Start from the working-tree or an explicit diff and return changed symbols, callers, import dependents, bounded impact paths, and likely tests |
| `code_context` | Edit-ready ContextPack: bounded source, reasons, relationships, changes/tests, gaps, and a hard budget; text by default |
| `code_health` | Opt-in (`codeHealth: true`): circular dependencies (import cycles) and orphan modules |

Plus an optional **auto-injected system prompt section** (`code-index:repo-map`, order 60): a compact ranked map selected from the active DSH session workspace. Set `autoInject: false` to disable and rely on the `code_map` tool only.

## Install

Requires `dsh` (any install path — npx, npm, or source) and Node ≥ 22.

The development compatibility target is `@deepseek-ai/dsh@0.2.0-rc.2` / `@deepseek-ai/dsh-tools@0.2.0-rc.2` (Node 22 and 24 CI matrix). The DSH plugin surface is still a preview API, so upstream changes may require compatibility updates.

v0.9 requires the matching `0.2.0-rc.2` tool runtime; the peer pin prevents fresh npm installs from selecting the older registry `latest` tag. Upgrade the host group together. The text/config/tool-surface compatibility above does not promise support for older DSH APIs.

```sh
# from npm (prebuilt)
npx @deepseek-ai/dsh plugin --profile web add dsh-code-index

# or from a directory containing this checkout
npx @deepseek-ai/dsh plugin --profile web add ./dsh-code-index
```

Restart the Web UI (`npx @deepseek-ai/dsh web`) — startup logs confirm each tool:

```
[dsh-code-index] plugin loaded
[dsh-code-index] registered tool: code_index
...
```

Verify the composed config without booting: `dsh --profile web --dump-config`.

## Using it

In a workspace session, ask the agent:

- "Which repo are we in — run code_map first."
- "Find every function whose name contains `parse` and where it lives."
- "List the exported symbols in src/core."
- "Rebuild the code index."
- "What changed in the working tree, who calls it, and which tests are likely affected?"
- "Fix duplicate configuration loading during startup." (the router selects the smallest useful context automatically)

No API key is needed to *index*; the model must of course be configured to call the tools.

## More capabilities

The index builds lazily on first use; later calls are served from the on-disk cache with mtime-incremental refresh.

### Call graph

`code_refs` traces definitions, callers, and callees. The following is an earlier real example of that existing tool, not a v0.9 Context Card:

![Earlier code_refs output](assets/code-refs-demo.png)

### Change-aware context

`code_change_context` defaults to the current Git working tree against `HEAD`. It also accepts an inline unified diff, repo-relative `files`, or stable `symbols` IDs. Results are bounded and each inferred relationship carries a provenance label: `exact`, `import-scoped`, or `name-only`. Deletions and renames use the baseline ref when available; untracked non-ignored files are included in working-tree mode.

### Edit-ready Context Packs

`code_context` routes change, symbol, architecture, test, exploration, and ambiguous tasks. Deterministic camel/snake terms plus file/path/signature terms rank candidates; exact named symbols are retained before selection. Strong primary seeds find likely tests even on a clean tree. Graph neighborhoods are bounded. BM25 is not used.

`budgetChars` defaults to 5000 and is normalized to 300–20000; `maxFiles` defaults to 12 and `maxSymbols` to 10. Budget units are JavaScript string characters, not tokens or UTF-8 bytes. Both rendered text and serialized final pack must fit. Code is never cut mid-line to fill the cap. Very small budgets can leave only signatures or gaps; a repository identity that cannot fit produces an explicit error. Task display is summarized to 120 characters without affecting routing.

The default canonical return remains a **string**. Request `outputFormat: "pack"` explicitly for the exported `ContextPack` DTO. Its `items` are already selected, with source `file/startLine/endLine/side/ref/mode/code`, `reason`, and separate relationship `resolution/provenance` where relevant. `budget.usedChars` accounts for text; `budget.packChars` accounts for serialized JSON. Render with `renderContextPack`; no hidden candidate list is exposed through the result.

Git changes with a readable, frozen baseline commit classify declarations as added/modified/deleted. Reliable file renames remain supported. Unknown or ambiguous structural identity is `unclassified`; symbol renames are not guessed. Explicit `files`/`symbols` in `code_change_context` remain selection modes, not a proof of a Git modification.

## Configuration

Options are passed as the plugin row's `config` in the profile patch (or defaults are used if absent):

```yaml
# $DSH_HOME/profiles/<name>/cordis.patch.yml — a bare row overrides by id.
- id: code-index
  config:
    excludeDirs: [generated, playground]
    mapTopFiles: 30
    mapMaxChars: 4000
    autoInject: true
    toolSurface: full
```

| Key | Default | Meaning |
|---|---|---|
| `excludeDirs` | `[]` | Extra directory names appended to built-in excludes. Matching is by exact path component; glob patterns such as `secrets/**` are not supported. |
| `mapTopFiles` | `24` | Max files in a ranked map |
| `mapMaxChars` | `3200` | Hard cap on rendered map characters |
| `mapTtlMs` | `60000` | Refresh interval for the auto-injected map (ms, min 1000) |
| `autoInject` | `true` | Register the system prompt section |
| `codeHealth` | `false` | Register the `code_health` tool (cycles / orphan modules) |
| `toolSurface` | `full` | Experimental `compact` mode exposes `code_index`, `code_context`, and enabled `code_health`; `full` preserves all tools |
| `externalWatch` | `true` | Watch source files in active project contexts for external edits |
| `watchDebounceMs` | `120` | Coalesce watcher events before refreshing affected files (minimum 20 ms) |

## Supported languages

TypeScript, JavaScript, Python, Go, Rust, Java, C++ and C (`.ts .tsx .mts .cts .js .jsx .mjs .cjs .py .pyi .go .rs .java .cpp .cc .cxx .c++ .hpp .hxx .hh .h .ipp .tpp .inl .c`) via tree-sitter WASM — pure parsing, no native build. The symbol provider seam (`src/extract.ts` + grammars) is where other languages/embeddings plug in later. C/C++ symbol extraction resolves names through the declarator chain (templates, qualified `ns::name` definitions, in-class methods), and `#include "…"` specifiers feed the repo-map reference graph.

## How it works

- **Index build** (`src/buildIndex.ts`): recursive scan (excludes applied), per-file tree-sitter extraction (`src/extract.ts`), JSON cache under `<repo>/.dsh-code-index/`, incremental refresh by mtime (only touched files re-parse).
- **Search** (`src/search.ts`): pure scoring — exact `1` / prefix `0.8` / substring `0.5`, export boost, name order tiebreak.
- **Repo map** (`src/repomap.ts`): personalized PageRank over the import graph (teleport = per-file density share, so hub files that are themselves imported by other hubs rise above flat in-degree counting), seeded by the density-aware file score (class/interface/function weighted, test paths damped), top-N files, per-file symbol cap, hard char truncation.
- **Call graph** (`src/refgraph.ts`): call sites extracted per file (per language, with their enclosing function) are resolved by name into callers and callees — `code_refs` exposes this directly, and `code_search` uses call fan-in as a ranking tie-break.
- **Change context** (`src/change-context.ts`): maps Git hunks to stable symbols, then follows bounded provenance-labeled callers, import dependents, entry paths, impact, and likely affected tests without returning the whole repository.
- **ContextPack** (`src/context.ts`, `src/context-pack.ts`, `src/source-excerpts.ts`): ranks task candidates, reads ephemeral source evidence, selects a final DTO under text/JSON budgets, then renders only selected items.
- **Health** (`src/health.ts`): Tarjan SCC over the import graph yields circular dependencies; orphan-module detection lists symbol-bearing files with no inbound or outbound imports (entry points and tests excluded).
- **Workspace resolution**: each tool resolves the session cwd (`agent.session.header.cwd`) and walks up to the nearest `.git` (bounded — a directory without a repo marker is never indexed).
- **Project contexts** (`src/repo-context.ts`): canonical real paths identify separate worktrees; up to four contexts are retained. Each tool call scans current metadata and reparses only changed files, while the watcher refreshes dirty files after a bounded debounce.
- **Ignore handling**: Git ignore rules from root and nested `.gitignore` files are applied to indexing. `excludeDirs` remains a list of exact directory names, not glob patterns.

## Known limitations

- **web-tree-sitter pinned to `^0.25` (ESM)** — the 0.25 line uses ESM named exports (`Language`/`Query`); this pairing with `tree-sitter-wasms` static builds is verified working under Node ≥ 22/24.
- Auto-injected maps use DSH's system-prompt assembly context for the active session. Agentless assembly falls back to the DSH process working directory. A newly accessed project may have an empty map on its first prompt while indexing completes; following assemblies receive its map.
- The watcher starts only for projects accessed by a tool and is disposed with the plugin. With `externalWatch: false`, per-call metadata scans still detect ordinary mtime changes.
- Large monorepos still require a directory metadata scan on each tool call. File parsing is incremental, but scan latency depends on repository size and storage speed.
- Function-local variables are excluded. Module declarations and class members are indexed; a parser/graph is not a type checker.
- Source reads reject files changed after the index snapshot, paths resolving outside the root, and current files over 1 MB. Signature-only fallbacks and gaps identify missing evidence; likely tests are leads, not proof of coverage.

## Development

```sh
pnpm install
pnpm test        # vitest — extractor, scan, cache, search, repo map, call graph, health
pnpm typecheck
pnpm build       # tsup → dist/index.js (ESM, external deps)
pnpm build && pnpm release:smoke # pack, clean-install the tarball, boot the plugin, and exercise core tools
```

The benchmark harness under `bench/` compares stock DSH, the published 0.5 baseline, the v0.6 change-aware treatment, and the v0.7 task-aware treatment. It records task completion, input tokens, tool calls, turns, and wall time; it does not invent missing provider usage. The repository contains infrastructure and sample tasks, not measured performance claims.

**WSL → Windows checkouts:** running `pnpm install` from WSL against a checkout on `/mnt/c` leaves Linux-style symlinks that Windows Node cannot traverse (`Cannot find package 'web-tree-sitter'`, `EACCES`). Repair without a reinstall from the Windows side:

```sh
node.exe scripts\fix-wsl-links.mjs            # this repo's node_modules
node.exe scripts\fix-wsl-links.mjs C:\Users\you\.dsh\profiles\web   # a dsh profile install
```

It re-points every dead link at its real `.pnpm` store entry as a junction; safe to re-run (idempotent, reports `fixed: 0` when clean).

## Feedback

Used dsh-code-index? Tell me what helped, what broke, or what context it missed. Reply in the [official DSH plugin discussion](https://github.com/deepseek-ai/deepseek-harness/discussions/5623), or use the [feedback issue form](https://github.com/lemonxiny55/dsh-code-index/issues/new?template=feedback.yml) if issue submissions are enabled for the repository.

To make a report actionable, include the approximate repository size and languages, the task you tried, the context you expected, and what the agent actually received. Mention whether project switching, a worktree, or an external file edit was involved. Please do not include private source code, credentials, or API keys.

## License

MIT. Not affiliated with DeepSeek; built on the public `dsh` plugin surface.

