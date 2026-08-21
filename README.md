# dsh-code-index

Semantic repo index — a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`) plugin that gives the agent a **codebase map**: a tree-sitter symbol index, ranked symbol search, and a bounded auto-updating repo map in the system prompt.

Fills a real ecosystem gap: search of the `dsh-plugin` topic (2026-08) shows git/voice/browser/memory plugins galore, but **no native, model-usable code index / repo-map capability** — the kind of thing aider's repo-map and Cursor's `@Codebase` do for their agents.

## What the model gets

| Tool | Purpose |
|---|---|
| `code_index` | Status / (re)build the index for the current workspace |
| `code_symbols` | List symbols (functions, classes, interfaces, types, methods…) with file:line — filtered by name, path, kind, exported |
| `code_search` | Ranked lookup: exact > prefix > substring, exports first, relevance score + file:line |
| `code_map` | Bounded ranked repo map (top files by symbol density, key symbols + lines) |

Plus an optional **auto-injected system prompt section** (`code-index:repo-map`, order 60): a compact ranked map of the default workspace, refreshed with a 60s TTL. Set `autoInject: false` to disable and rely on the `code_map` tool only.

## Install

Requires `dsh` (any install path — npx, npm, or source) and Node ≥ 22.

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

No API key is needed to *index*; the model must of course be configured to call the tools.

## Example (input → output)

User prompt:

> Which repo are we in? Run `code_map` first, then find where `extractSymbols` is defined.

The agent calls the tools in turn:

```
code_map
# repo map
## src/extract.ts (14)
  function extractSymbols(code, id) :121
  function languageForFile(filePath) :37
  ...

code_search { query: "extractSymbols" }
export function extractSymbols(code, id) — src/extract.ts:121
```

The index builds lazily on first use; later calls are served from the on-disk cache with mtime-incremental refresh.

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
```

| Key | Default | Meaning |
|---|---|---|
| `excludeDirs` | `[]` | Extra dirs appended to the built-in excludes (`node_modules`, `.git`, `dist`, `build`, `out`, `coverage`, `.next`, `.nuxt`, `.cache`, `target`, `vendor`, …) |
| `mapTopFiles` | `24` | Max files in a ranked map |
| `mapMaxChars` | `3200` | Hard cap on rendered map characters |
| `autoInject` | `true` | Register the system prompt section |

## Supported languages

TypeScript + JavaScript (`.ts .tsx .mts .cts .js .jsx .mjs .cjs`) via tree-sitter WASM — pure parsing, no native build. The symbol provider seam (`src/extract.ts` + grammars) is where other languages/embeddings plug in later.

## How it works

- **Index build** (`src/buildIndex.ts`): recursive scan (excludes applied), per-file tree-sitter extraction (`src/extract.ts`), JSON cache under `<repo>/.dsh-code-index/`, incremental refresh by mtime (only touched files re-parse).
- **Search** (`src/search.ts`): pure scoring — exact `1` / prefix `0.8` / substring `0.5`, export boost, name order tiebreak.
- **Repo map** (`src/repomap.ts`): density-aware file score (class/interface/function weighted, mild anti-bloat), top-N files, per-file symbol cap, hard char truncation.
- **Workspace resolution**: each tool resolves the session cwd (`agent.session.header.cwd`) and walks up to the nearest `.git` (bounded — a directory without a repo marker is never indexed).

## Known limitations

- **web-tree-sitter pinned to `^0.20.8`** — newer releases expect dylinked grammar wasm while `tree-sitter-wasms` ships static builds; this pair is verified working under Node ≥ 22/24.
- Auto-injected section targets the **default workspace** (launch directory, matching headless/CLI mode). Multi-workspace Web UI sessions should use `code_map`/`code_symbols` (they resolve per-session cwd).
- Local variables are indexed too — recall over precision; `code_search` ranking keeps them low.
- Developer-preview harness: expect breaking harness/plugin API changes upstream.

## Development

```sh
pnpm install
pnpm test        # vitest — extractor, scan, cache, search, repo map (35 tests)
pnpm typecheck
pnpm build       # tsup → dist/index.js (ESM, external deps)
```

## License

MIT. Not affiliated with DeepSeek; built on the public `dsh` plugin surface.
