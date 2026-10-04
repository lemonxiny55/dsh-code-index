# Contributing

Thanks for helping with dsh-code-index! This is a small, dependency-light plugin — keep it that way.

## Setup

```sh
pnpm install
```

Requires Node ≥ 22 and pnpm.

## Develop

- **`pnpm test`** — vitest suite (extractor, scan, cache, search, repo map, tools).
- **`pnpm typecheck`** — `tsc --noEmit`.
- **`pnpm build`** — tsup → `dist/index.js` (ESM, external deps).
- **Load into a local dsh web** — from the repo root:

  ```sh
  # build once, then mount the local bundle
  npx @deepseek-ai/dsh plugin --profile web add ./dsh-code-index
  npx @deepseek-ai/dsh web
  ```

  Restart the server to pick up new builds; logs confirm seven full-surface tools (plus opt-in `code_health`) register. The verified development target is the matching DSH / dsh-tools `0.2.0-rc.2` group.

## Conventions

- New symbols/languages plug into `src/extract.ts` (provider seam) — follow the existing query/capture pattern and add a vitest case per language.
- Keep tool `output.render` thin. `code_context` defaults to a canonical string; only explicit `outputFormat: pack` returns the selected ContextPack DTO.
- Every behavior change ships with a test (regressions are how this project caught its own bugs).
- `SymbolInfo.file` is always the repo-relative path (forward slashes) — the store self-heals stale `""` values on load.

## Release checklist

1. Bump `version` in package.json + add a CHANGELOG entry.
2. `pnpm typecheck && pnpm test && pnpm build`.
3. Run `pnpm release:smoke`: pack, install in a disposable directory, exercise both tool surfaces and text/pack output, then dispose.
4. Review `tests/context-quality.spec.ts` contracts: must include, forbidden noise, reasons/provenance, exact source evidence, budget. Run Node 22 and 24 checks.
5. Record current RC runtime evidence separately from real Agent/Web evidence. Follow `AGENTS.md` stop conditions; do not investigate unrelated extensions.
6. Review release evidence and obtain operator authorization before publishing, tagging, creating a GitHub Release, or pushing main. RC readiness alone authorizes none of these actions.
