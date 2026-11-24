# Release Evidence — v0.14.0

**Status:** Local release candidate prepared on branch `feat/v0.14.0-precision` (package version `0.14.0`, pending final merge & publication confirmation).

## 1. M1 Path Alias & Barrel Re-export Precision Comparison

Measured against the compiled bundle (`dist/index.js`) comparing v0.13.0 baseline behavior (no alias config resolution, no barrel re-export traversal) vs. v0.14.0 M1 (`src/alias.ts` + `src/refgraph.ts`):

| Scenario | Before (v0.13.0 baseline) | After (v0.14.0) | Observed Delta |
| --- | --- | --- | --- |
| **TS Business Repo (`@/*` + `exports` + 2-level barrel + wildcard ambiguity)** | `exact`: 0, `import-scoped`: 0, `name-only`: 3 (3 edges; aliased renamed export `submitOrder` lost) | **`exact`: 2**, **`import-scoped`: 2**, **`name-only`: 0** (4 edges) | Aliased named barrel resolved to `exact`; `export *` and multi-match `@amb/*` downgraded honestly to `import-scoped` (`ambiguous-alias` gap emitted); `name-only` dropped to `0` |
| **HarmonyOS ArkTS (`oh-package.json5` `file:` + `Index.ets` barrel)** | `exact`: 0, `import-scoped`: 0, `name-only`: 1 (ArkUI component `Badge` missed) | **`exact`: 2**, `import-scoped`: 0, **`name-only`: 0** | `Badge` and `fetchProfile` resolved as `exact` via `oh-package+reexport(1)` while keeping `@ohos.*` blocked |
| **Self-Check on `dsh-code-index` Repository (12,932 call sites)** | `exact`: 1,535, `import-scoped`: 7, `name-only`: 3,442 (4,984 total edges) | **`exact`: 1,565 (+30)**, `import-scoped`: 7, **`name-only`: 3,410 (-32)** (4,982 total edges) | Eliminated cross-file name guessing across internal barrel re-exports (`impact-xray.ts`, `context.ts`, `index.ts`) |

## 2. M2 Review Brief & Budget Regression

### Representative `Review Brief` Output (`budgetChars = 5000`, measured `4806/5000`)

Observed on a real Git-initialized `pnpm-workspace.yaml` monorepo with `@core/*` alias, changed import cycle, cross-package caller (`@mono/core -> @mono/web`), and Vitest test lead (`verification: "not-run"`):

```text
Review Brief — indexed static only; runtime behavior not proven.
Repo/worktree: <temp-monorepo-root>
HEAD: <commit>; base: <commit>; dirty: true
Selection: git; 1 changed symbols, 6 static relations, 1 candidate tests, 0 unmapped changes.
Index: 5 parsed, 0 partial, 0 failed, 0 unknown; parsed is not semantic proof.
Change: modified coreApi packages/core/src/a.ts:2-2 [current; complete]
export function coreApi(x: number) { return helperB(x) + 10 }
Potential impact: mountPage apps/web/src/page.ts:2 [path exact; depth 1]; via apps/web/src/page.ts:2 [hop exact; explicit-import-binding; via: tsconfig-path]
...
Cross-package impact:
  packages/core [@mono/core] -> apps/web [@mono/web] (3 refs)
Candidate tests: not-run; coverage not verified.
Candidate: apps/web/tests/page.spec.ts [import-scoped; imports-impact-file] — lead: pnpm vitest run apps/web/tests/page.spec.ts
Warning: cycle-warning: packages/core/src/a.ts -> packages/core/src/b.ts
Omitted from analysis: 0 changes, 0 relations, 0 tests, 0 warnings; 0 source bodies not included.
Gaps: entry-paths-not-projected; use xray for full paths; non-atomic-snapshot
Budget (full JSON envelope): 4806/5000
```

### Hard Budget & Priority Trimming Matrix

Verified in [tests/verification-leads.spec.ts](tests/verification-leads.spec.ts) and [tests/monorepo-cycle.spec.ts](tests/monorepo-cycle.spec.ts) across `budgetChars` = `300`, `500`, `5000`, and `20000`:
- `renderReviewBrief(out.brief)` equals `out.text` and both `out.text.length` and `JSON.stringify(out).length` remain strictly `<= budgetChars` (`out.brief.budget.usedChars === JSON.stringify(out).length`).
- Whole source lines in `out.brief.changes` are never sliced mid-line.
- Under tight budgets, optional `commandLead` (`command-lead-budget`) and `crossPackageImpact` (`cross-package-impact-budget`) trim before core changed-symbol excerpts, strong callers, and candidate test paths.

## 3. Local Gate & Tarball Smoke Verification

Executed on **Node `v24.19.0`** (Windows) from branch `feat/v0.14.0-precision` after bumping `package.json` to `0.14.0`:

| Gate | Command | Observed Result |
| --- | --- | --- |
| **Typecheck** | `pnpm typecheck` | Pass (`tsc --noEmit`, exit code `0`) |
| **Unit & Integration Tests** | `pnpm test` | Pass — **36 test files, 348 tests passed** (`vitest run`, 29.07s) |
| **Production Build** | `pnpm build` | Pass — `dist/index.js` (292.08 KB), `dist/index.d.ts` (44.51 KB), `dist/client.js` (61.66 KB) |
| **Tarball Install & Runtime Smoke** | `pnpm release:smoke` | Pass — `release smoke passed (normal npm peer resolution and DSH runtime) for dsh-code-index@0.14.0 with dsh-tools@0.2.1-rc.3` |

`pnpm release:smoke` verified:
- Tarball contents (`package.json`, `README.md`, `README.zh.md`, `CHANGELOG.md`, `LICENSE`, `cordis.patch.yml`, `dist/*`, `grammars/*`, `scripts/*`).
- Clean `npm install --ignore-scripts --no-save` with normal prerelease peer resolution against `@deepseek-ai/dsh-tools@0.2.1-rc.3` (no `--force` / `--legacy-peer-deps`).
- Plugin `apply()` / `dispose()` across `full` (all 8 tools) and `compact` (`code_index`, `code_context`, `code_health`) surfaces.
- Installed `ToolRuntime` execution across ArkTS, Rust, Gitignore directory whitelist, Evidence Summary budgets, `Impact X-Ray`, and `Review Brief` (`300 / 500 / 1000 / 2000 / 5000 / 20000` JS-char budgets, `verification: "not-run"`).

## 4. Verification Boundaries & Scope Declaration

- **Static-only resolution:** No full TypeScript type-checker, HarmonyOS compiler, or runtime call tracer is executed; `exact` remains a structural-index property, not runtime proof.
- **No test execution:** `commandLead` suggestions are derived strictly from static manifests (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`); `verification` stays `"not-run"`, and `child_process.execFile` never invokes test runners.
- **Non-atomic workspace metadata:** Git `HEAD`/dirty state and file mtimes remain point-in-time observations.
- **No Desktop UI or model-driven Agent claim for v0.14.0:** This gate establishes local TypeScript checks, 36 Vitest suites, production ESM/DTS/client builds, and clean tarball installation + `ToolRuntime` execution via `pnpm release:smoke`; it does **not** claim a new v0.14.0 DSH Electron Desktop manual run or live LLM Agent evaluation.
