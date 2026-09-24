# v0.8.0 Release Evidence

**STATUS: v0.8.0 RELEASE READY**

## Real DSH Web gate

The following was completed manually in the real DSH Web profile by the project operator. This records the operator-reported result; the A/B workspace run was not repeated during this release-note closeout.

| Gate | Result | Evidence summary |
| --- | --- | --- |
| `V0.8_REAL_DSH_WEB_GATE` | PASS | Real DSH Web Agent sessions used the v0.8.0 package. |
| `PROJECT_A_CONTEXT` | PASS | Repo A default context contained `alphaOnlySymbol`; it did not contain `betaOnlySymbol`. |
| `PROJECT_B_CONTEXT` | PASS | Repo B default context contained `betaOnlySymbol`; it did not contain `alphaOnlySymbol`. |
| `A_B_A_ISOLATION` | PASS | Returning from B to A retained A's symbol and did not expose B's symbols. |
| `EXTERNAL_ADD_FRESHNESS` | PASS | `externalFreshnessMarker` appeared in the same B session after an external file add and normal debounce. |
| `EXTERNAL_DELETE_FRESHNESS` | PASS | After external deletion, the marker disappeared and the symbol count returned from 2 to 1. |
| `NO_MANUAL_REBUILD` | PASS | No explicit `code_index` rebuild was used for the external add/delete freshness checks. |
| `CHANGE_CONTEXT` | PASS | `code_change_context` reported B's `betaOnlySymbol` and `betaCaller`, without A's symbol. |
| `CALL_RELATIONSHIP` | PASS | The reported relationship was `betaCaller → betaOnlySymbol`. |
| `CROSS_PROJECT_CONTAMINATION` | NONE | No A/B symbol leakage was observed. |

The profile temporarily used for the separate source-kind diagnosis was restored from the pre-test Plugin Manager snapshot. The manager reported the original plugin and bundle enable states restored; no API key was read or changed, and no third-party plugin code or plugin-specific configuration was modified.

The separate `format v4 message requires a producer-owned source kind` error was observed when other installed extensions were present. It was not reproduced in the code-index-only real Agent check and is not treated as a `dsh-code-index` v0.8.0 release blocker. No third-party extension was changed as part of this release.

## Automated checks

The release-closeout commands were run after the evidence and release-note updates.

| Command | Result |
| --- | --- |
| `pnpm test` | PASS — 19 files, 189 tests. Used a deep temporary directory under the OS temp root so the fixture's bounded Git-root search did not encounter the user's home-level `.git` marker. |
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS — Node 22-targeted ESM package and browser client bundle. |
| `git diff --check` | PASS |
| `pnpm dlx --package=npm@10.9.3 npm pack` | PASS — `dsh-code-index-0.8.0.tgz`. The tarball was consumed and removed by release-smoke cleanup. |
| `pnpm dlx --package=npm@10.9.3 node scripts/release-smoke.mjs` | PASS — temporary tarball install, full and compact tool surfaces, core tool calls, and plugin dispose checks. |

## Post-publish registry verification

| Check | Result |
| --- | --- |
| npm registry metadata for `dsh-code-index@0.8.0` | PASS — version and tarball metadata are available from the public registry. |
| Fresh install from npm registry | PASS — package installed in a disposable directory, loaded as `dsh-code-index@0.8.0`, registered all 8 full-surface tools, and disposed cleanly. |
