# v0.9.1 release candidate evidence — 2026-10-10

**RELEASE READY. Not published.** The final candidate-specific Desktop Agent gate
passed on 2026-10-10. This status authorizes no publication by itself.

This candidate is based on current main `84412472b80c4d9a4edb00243e687df7731219bf`
on branch `codex/fix-gitignore-v0.9.1`. No main push, npm publication, tag or GitHub
Release was performed. Package version is `0.9.1`; CHANGELOG now contains the
prepared final-release wording. Publication still awaits user confirmation.
The existing untracked `HANDOFF_PROMPT.md` is preserved.

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

## Real Desktop Agent gate — PASS

The initial attempt found no targetable window and left the candidate RC READY.
The final check used the running **DeepSeek Harness Desktop**, real `desktop`
profile, bundled CLI 0.2.0-rc.2 / Node 24.18.1, and its existing configured model
`deepseek-ai/deepseek-v4.1-flash` through the NVIDIA provider. Windows UI automation
submitted three bounded prompts; this was a model-backed Desktop conversation,
not a manual human check or a direct invocation of plugin handlers.

Session: `session-2ec70e5b-da0c-455c-80eb-c57f79d466bf`. The persisted session
records show **10 actual tool calls, 10 successful tool results and 3 completed
turns**. Only `code_index`, `code_search` and `code_context` executed. The filtered,
audited results are retained in
[assets/desktop-v0.9.1-tool-evidence.json](assets/desktop-v0.9.1-tool-evidence.json);
unrelated conversations and system prompts are excluded.

The loaded plugin was a regular directory extracted from the retained candidate
tarball above, not the workspace junction. Its `dist/index.js` hash matched the
candidate hash. Only its dependency directory used a junction to the existing
workspace dependencies. Desktop was quit and restarted before the conversation.

The tiny Git fixture used the original Issue #2 rules:

```gitignore
/extensions/*
!/extensions/keep/
!/extensions/keep/**
```

It contained `KEPT_MARKER_fn`, its importing test and one control source, plus an
ignored sibling `SKIPPED_fn` and a nested `*.generated.ts` exclusion containing
`NESTED_IGNORED_fn`. Git independently confirmed the exclusions. The tracked
baseline was `6a0f79f741a8253d034b107a207de8268387eb14` in the disposable fixture
`.dsh-code-index/maintenance/desktop-v091/fixture`.

| Observable result | Actual Desktop tool evidence |
| --- | --- |
| Whitelisted source indexed | Initial build: 3 files / 3 symbols; `KEPT_MARKER_fn` search: 1 hit in `extensions/keep/kept.ts:1` |
| Exclusions honored | `SKIPPED_fn` and `NESTED_IGNORED_fn`: 0 hits each |
| Original missing source accessible | `code_context` with `outputFormat: pack` returned complete baseline source and its importing test |
| External add/edit freshness | After external writes, `FRESH_MARKER_fn`: 1 hit without rebuilding; change pack returned complete added/modified sources with `RC091_ADDED` / `RC091_EDIT`, no stale `RC091_BASE` |
| External delete freshness | After external deletion, `FRESH_MARKER_fn`: 0 hits; status: 3 files / 3 symbols, index up to date |
| Context Pack continuity | Related test and exact `explicit-import-binding` / import-scoped provenance present; added/modified classification correct; 7 complete source ranges independently matched source snapshots |
| Rendered budgets/default text | Pack text lengths 1486/5000 and 1626/5000; omitted `outputFormat` returned default text, signature fallback and explicit budget gap at 366/500 |

After the initial build, no rebuild, manual refresh, unrelated read/grep/terminal
tool, source edit by the Agent or test execution occurred. The external edits were
made between completed turns. The unchanged test's `=== 1` assertion after changing
the fixture function to return 91 was deliberate; the gate checks affected-test
retrieval, not test assertion repair.

Desktop exposes pack results as rendered text. This check establishes source,
provenance, change classification and rendered-budget behavior, not a canonical
pack JSON shape or serialized-object cap. Those remain covered by the earlier
Native ToolRuntime/unit/packaged checks. Budget gaps were explicitly reported;
no broader Context Pack regression matrix is claimed.

Compatibility observations are separate from plugin results:

- The official CLI tarball installation hit Windows `EPERM` while creating a
  peer dependency symlink. A single bounded fallback extracted the exact tarball
  into the profile plugin directory and reused existing dependencies. No host or
  third-party code, credentials or extension enable states were changed.
- Two model transport connection errors were automatically retried and recovered.
  All target tools succeeded and all turns completed; no ecosystem investigation
  or extension isolation was needed.

The temporary tarball installation was retained as a backup and the original
workspace junction restored after validation. The CLI's partial lockfile change
was restored from the pre-install backup; profile package/config hashes were
checked. The candidate tarball and `HANDOFF_PROMPT.md` remain unchanged.

The final required Desktop gap is closed. There is no remaining known blocker
for this bounded v0.9.1 gate. Earlier Node 22/24, typecheck, build and consumer
installation results above are retained; they were not rerun for this evidence-only
update. No npm publish, main push, tag or GitHub Release was performed.

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

## Final publication preflight — 2026-10-10

**Product validation: RELEASE READY. Publication: pending user confirmation,
remote CI and usable publishing credentials.** This is a preparation record,
not a publication result. No main merge/push, tag, Release or Issue closure has
been performed in this preflight.

The scope audit against main found only the Issue #2 scanner/watcher fix,
its five regressions and installed-package smoke, the 0.9.1 version bump,
CHANGELOG and verification evidence. The preparation follow-up changes release
documentation only. Runtime source, tests, scripts, package metadata and lockfile
remain identical to the verified `c5bb3e6` tree; no ArkTS/v0.10 work was introduced.

Fresh remote checks confirmed main at
`84412472b80c4d9a4edb00243e687df7731219bf`, also the local branch's base. Main can
fast-forward without a conflict. Its existing CI passed, but there are **zero
remote workflow runs for `c5bb3e6`**; the old main result is not a release-commit
CI result. The existing push-to-main workflow runs frozen install, typecheck,
tests, both builds and consumer-install smoke on Node 22 and 24.

The registry's `latest` remains 0.9.0; 0.9.1 is absent. The remote `v0.9.1` tag is
absent. GitHub connector reads and repository admin permission work, but the
local GitHub CLI API request returned HTTP 403. The npm credential check returned
HTTP 401 even with a writable workspace cache. Publishing authentication must
be available before actual publication; no credential changes or secrets were
requested/read. The unrelated global-cache permission error was avoided by using
the workspace cache; no wider investigation was performed.

Prepared npm artifact (generated with `npm pack --ignore-scripts`, without
rebuilding or repeating Desktop verification):

- Path: `.dsh-code-index/maintenance/release-v091/dsh-code-index-0.9.1.tgz`
- Name/version: `dsh-code-index@0.9.1`; 16 entries, 179445 bytes.
- SHA256: `1C16B72F7F05A73CB71BC4A1864E16434306031279260A96087C9BF011F8A7AB`
- SHA1: `c7c4bbd24a04dce54f2e11e4a1877b706db5f6dd`
- Integrity: `sha512-0NnbKSKbahlJForgklLZDIWiJ2hMtdvVfaUaNlvLvsVid1RETlrsW8ZH/pz1P/O+AcdMr/jcV7iesSBmROXjNQ==`

All 16 archive paths match the retained RC. **15 files are byte-identical; only
CHANGELOG.md differs**, replacing RC wording with the prepared release entry.
Compiled runtime, maps, declarations, client, package metadata, README files,
patch and all scripts match the tested RC. Evidence, release-note drafts,
`HANDOFF_PROMPT.md` and development dependencies are excluded. Archive contents,
version, package manifest, SHA1/SHA512 and SHA256 were independently checked;
the comparison inventory is retained beside the tarball as
`package-comparison.json`. `npm publish <prepared-tarball> --dry-run
--ignore-scripts --tag=latest --registry=https://registry.npmjs.org` passed and
reported the same package/version/integrity. A dry-run does not establish usable
publishing credentials. The original RC archive and HANDOFF hashes are unchanged.

[RELEASE_NOTES_v0.9.1.md](RELEASE_NOTES_v0.9.1.md) is the prepared English/Chinese
Release body. It thanks @bbskye5008 and retains @garyschulte's historical credit.

After explicit user confirmation, execute these gates in order:

1. Recheck the remote base and clean tracked tree, safely fast-forward main to
   the prepared branch and push without force. If remote main moved, reassess
   the merge before proceeding.
2. Require successful Node 22/24 CI jobs on that exact main commit. Record the
   run link in the Release body. Stop publication if CI fails.
3. Recheck version availability and prepared archive hashes, then publish that
   exact tarball with tag `latest` and scripts disabled. Read back npm version,
   tag, SHA1/integrity and download the published artifact to verify its hash.
4. Create `v0.9.1` on the CI-verified main commit and the GitHub Release using
   the bilingual body. Verify both public links.
5. Only after npm and Release verification, post the prepared English thanks
   and resolution to Issue #2 and close it as completed. Record the reply link
   and final commit/branch/status. Preserve `HANDOFF_PROMPT.md` throughout.

## Suggested release note (unpublished)

Fix Gitignore directory whitelist rules that silently omitted source trees and
their related tests. Directory matching is now consistent across scanning and
watching; nested ignore-file precedence follows Git semantics. Existing tool APIs
and symlink behavior are preserved. Thanks to @bbskye5008 for Issue #2's detailed
report and reproduction. The Chinese/English settings-card attribution to
@garyschulte remains in the v0.8.0 history.
