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

  Restart the server to pick up new builds; logs confirm the four tools register.

## Conventions

- New symbols/languages plug into `src/extract.ts` (provider seam) — follow the existing query/capture pattern and add a vitest case per language.
- Keep tool `output.render` thin: canonical JSON from `execute`, text conversion in render.
- Every behavior change ships with a test (regressions are how this project caught its own bugs).
- `SymbolInfo.file` is always the repo-relative path (forward slashes) — the store self-heals stale `""` values on load.

## Release checklist

1. Bump `version` in package.json + add a CHANGELOG entry.
2. `pnpm typecheck && pnpm test && pnpm build`.
3. Publish: `npm publish --registry=https://registry.npmjs.org/ --otp <code>`.
4. Tag + GitHub Release at the bumped version.