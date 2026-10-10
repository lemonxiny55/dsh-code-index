# v0.9.1 release candidate evidence — 2026-10-10

**RC READY. Not published. RELEASE READY is not claimed.**

This candidate is based on current main `84412472b80c4d9a4edb00243e687df7731219bf`
on branch `codex/fix-gitignore-v0.9.1`. No main push, npm publication, tag or GitHub
Release was performed. Package version is `0.9.1`; CHANGELOG explicitly marks it
as an unreleased candidate. The existing untracked `HANDOFF_PROMPT.md` is preserved.

## Minimal observable gate

Using the Issue #2 tiny repository, whitelisted source must be scanned, searchable,
and returned as actual source by `code_context`; ignored siblings must remain absent.
Scanner and watcher must agree on directory-only rules and nested precedence.
External additions, edits and deletions must refresh the index, and the whitelisted
test suite must appear in change context. Verify Node 22/24, typecheck, both builds,
and an actual packaged consumer installation. Attempt a minimal real Desktop Agent
check when a targetable environment is available.

## Reproduction and fix

Before changing implementation, `tests/scan.spec.ts` reproduced two failures:

- The original `/extensions/*`, `!/extensions/keep/`, `!/extensions/keep/**`
  fixture returned only `src/control.ts`, omitting `extensions/keep/kept.ts`.
  `git check-ignore --no-index -q` independently confirmed the source is included.
- A nested `!keep.generated.ts` failed to override an upper `*.generated.ts` rule.

The directory probe had no trailing slash, so the `ignore` library treated it as
a file and missed directory-only whitelist rules. Both the scanner and watcher
used this shape. Separately, combining layers with `some(ignores)` prevented
deeper file-level negations from overriding upper matches.

`src/scan.ts` now shares directory-aware layer evaluation, applies the deepest
matching rule, and checks ancestors before reading nested rules. An excluded
parent still cannot be rescued by a child's ignore file. Removed/unreadable ignore
files are removed from the matcher cache. Chokidar's ignored predicate waits for
the supplied stat before Git filtering, preventing its initial untyped probe from
pruning a whitelisted directory. Explicit directory exclusions remain authoritative.

Five added tests cover the original whitelist, positive directory exclusions,
plain patterns, excluded-parent behavior, nested precedence, cached ignore-file
edit/delete, tool retrieval/affected tests, and watcher add/change/delete.
Git serves as the ignore oracle in the scanner regressions. Watcher assertions
observe background refresh without calling `get()`; tool freshness tests separately
exercise the per-read scan, including nested ignore-rule changes.

## Fresh verification results

| Check | Method | Result |
| --- | --- | --- |
| Node 24.19.0 | `node node_modules/vitest/vitest.mjs run` | PASS: 24 files, 220 tests |
| Node 22.23.3 | Same complete suite with official Windows Node 22 on PATH | PASS: 24 files, 220 tests |
| Typecheck, both versions | `node node_modules/typescript/bin/tsc --noEmit` | PASS |
| Build, both versions | tsup server followed by `--config tsup.client.config.ts` | PASS: ESM, public declarations, browser client |
| Pack/install, both versions | `node scripts/release-smoke.mjs` | PASS: real npm pack and disposable consumer install |
| Installed Issue #2 check | Added fixture in release smoke | PASS: two files, kept source search/context, ignored sibling absent, external add/delete |
| Existing runtime compatibility | Full suite including `tests/compat.spec.ts` and release smoke | PASS: Native ToolRuntime checks plus full/compact tool surfaces, text/pack output and disposal |
| Diff whitespace | `git diff --check` | PASS |

The Node 22 ZIP was downloaded from `nodejs.org/dist/v22.23.3` and its SHA256 was
matched against official `SHASUMS256.txt` before execution. Dependencies and lockfile
are unchanged. No remote CI run is claimed; the branch has not been pushed.

The final built `dist/index.js` SHA256 is
`A421CC93C572155114B2590E3C31421AB80AFD9605111404CDA4C269F72458A4`.
The retained candidate tarball and npm pack inventory are local ignored artifacts:

- `.dsh-code-index/maintenance/dsh-code-index-0.9.1.tgz`
- `.dsh-code-index/maintenance/pack.json`

Retained tarball: 16 entries, 179443 bytes; SHA256
`EEAAA68F84B3E9EA74EED254816ADFA8BD5FC828C64A04C352A365BB2E82F3AC`.

Initial sandbox runs failed before fixture behavior could execute (temporary-cache
rename and `realpath` permissions). The same checks passed with normal filesystem
access and workspace temporary/cache directories. These were execution-environment
limitations, not DSH host or third-party extension failures.

## Conditional Desktop gate

**Not performed.** Computer Use app and window inventories returned no targetable
DSH Desktop window. There were no new Agent requests or `tool/call` events. No host
error, third-party defect or plugin Desktop success is inferred from that absence.
No profile, credentials or extension enable states were changed; no ecosystem
diagnosis was started. Prior v0.9.0 Desktop evidence is not substituted for v0.9.1.

Remaining validation gap: run the same tiny whitelist fixture through a real DSH
Desktop Agent, then add/delete a source externally and repeat search/context without
manual rebuilding. Until that candidate-specific evidence exists, keep the status
at RC READY. There is no known code, test, build or packaged-install blocker.

## Independent PR #1 review

Compared PR head `a87f42d22c8ab87928de568e0dab9c10f14cff82` (the older 0.7-era
implementation) with current main and the v0.8.0 tag. The settings client and locale
tests are unchanged between v0.8.0 and current main. Both languages, locale lifecycle,
fallback operation and legacy settingsScope integration are implemented; the current
client also supports configForms/settings.plugins.tab. Existing locale tests cover
dictionary parity/nonblank translations, both locale registrations, missing service,
and disposal/reload behavior. They pass in both complete Node suites. This is unit
coverage, not a newly performed visual locale-switch test.

The implementation's English fallback, namespace and per-card injected state differ
from the PR's Chinese fallback and module-global bound lookup; those are host
adaptations, with no missing substantive English/Chinese settings-card feature found.
v0.8.0 and v0.9.0 npm versions were read back from the registry. The v0.8.0 CHANGELOG
and published GitHub Release both credit @garyschulte and link PR #1. Attribution
remains in this candidate's CHANGELOG.

PR #1 was thanked and closed as superseded, without merging. This review did not
expand the Issue #2 fix into UI changes.

- [Issue #2 acknowledgement](https://github.com/lemonxiny55/dsh-code-index/issues/2#issuecomment-6095107574)
- [PR #1 reply](https://github.com/lemonxiny55/dsh-code-index/pull/1#issuecomment-6095124815)

## Suggested release note (unpublished)

Fix Gitignore directory whitelist rules that silently omitted source trees and
their related tests. Directory matching is now consistent across scanning and
watching; nested ignore-file precedence follows Git semantics. Existing tool APIs
and symlink behavior are preserved. Thanks to @bbskye5008 for Issue #2's detailed
report and reproduction. The Chinese/English settings-card attribution to
@garyschulte remains in the v0.8.0 history.
