# v0.10.0 release evidence — 2026-10-13

## Actual publication — RELEASED

**v0.10.0 formally released on 2026-10-13.** The maintainer explicitly authorized
PR merge, main CI, npm publication, tag/Release and the original ArkTS-thread
follow-up. No functionality or unrelated refactor was added during publication.
The preflight records below are dated historical evidence, superseded by this
publication record; their original authorization boundaries apply to those gates.

- [PR #3](https://github.com/lemonxiny55/dsh-code-index/pull/3) merged at
  **2026-10-13 03:04:03 UTC** using a merge commit and exact-head guard.
  Verified PR head: `ee98b5b3451fb460ed9ec1fa8cd3c00f19332809`.
- Main release commit: **`7e6a41bb983d7198c63aa0660636665cb82d16f9`**.
  Parents are the unchanged main baseline `1fffc47da40e5506f0e96a59e059582f8caeb77c`
  and the verified PR head. Both release/head trees equal
  `ff1b1eee4cc8c028c8416421dfe8e9402ff1024c`: zero source/resource differences.
- [PR CI](https://github.com/lemonxiny55/dsh-code-index/actions/runs/38339361608)
  and [post-merge main CI](https://github.com/lemonxiny55/dsh-code-index/actions/runs/38339921204)
  succeeded against their exact respective commits.

| Post-merge Ubuntu job | Test results | Other release checks |
| --- | --- | --- |
| [Node 22.23.3](https://github.com/lemonxiny55/dsh-code-index/actions/runs/38339921204/job/115108370911) | 25 files, 234 passed, 1 skipped, 0 failed (235 total) | Frozen-lockfile install, typecheck, builds, installed-package smoke passed |
| [Node 24.21.0](https://github.com/lemonxiny55/dsh-code-index/actions/runs/38339921204/job/115108370824) | 25 files, 234 passed, 1 skipped, 0 failed (235 total) | Frozen-lockfile install, typecheck, builds, installed-package smoke passed |

The skip is the existing Windows-only cache-key casing test. Local Windows
22.23.3/24.19.0 passed all 235 tests as recorded below. Both main CI jobs reported
`release smoke passed for dsh-code-index@0.10.0`; Linux CI builds its own archive,
without a byte-identical archive claim. No large Desktop gate was repeated because
the runtime, grammar and dependencies remained unchanged.

### npm registry verification

- Immediately before publication, npm `0.10.0` returned E404 and `latest` was
  `0.9.1`; PR head, main baseline and candidate hash were unchanged.
- Initial identity check returned E401. The maintainer completed local npm login
  and the publish browser/2FA authorization manually. No token or OTP was requested
  or recorded in project evidence.
- Published once with `npm publish <original stable tarball> --ignore-scripts
  --tag latest --access public --registry https://registry.npmjs.org` (exit 0).
  Registry processing briefly returned E404; a subsequent read succeeded without
  repeating publication.
- [npm dsh-code-index@0.10.0](https://www.npmjs.com/package/dsh-code-index/v/0.10.0):
  registry version **0.10.0**, registry **latest = 0.10.0**.
- [Actual registry archive](https://registry.npmjs.org/dsh-code-index/-/dsh-code-index-0.10.0.tgz)
  was downloaded and independently hashed/extracted: SHA256
  **`0EA5E02E577F347CBD4437782BE4CAF160716BB8D77C3B6518E59EBE107C06A2`**,
  SHA1 `6799616b61e8146cd90c2b184dcf16febbade70e`, 19 files. Registry integrity equals
  the candidate integrity below. Every extracted file hash matches
  [the submitted inventory](assets/package-v0.10.0-preflight.json), including the
  pinned ArkTS WASM, MIT notices, version manifest and all dist/resources.
  The npm archive is byte-for-byte the previously validated stable candidate.

### GitHub Release and community follow-up

- Annotated tag **v0.10.0** was created without replacing an existing tag and
  pushed once. Tag object `4e0577b4b9dfe71bded025f4840bb0269045b384` peels to
  main release commit `7e6a41bb983d7198c63aa0660636665cb82d16f9`.
- [GitHub v0.10.0 Release](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.10.0)
  published **2026-10-13 03:08:50 UTC**, non-draft, non-prerelease. It uses the
  prepared English/Chinese notes with the actual released header, main CI and
  artifact verification. Neither release commit nor tag was rewritten afterward.
- After npm and GitHub Release were verified, the explicitly authorized reply was
  posted to `sajjad000`'s original ArkTS comment (database ID 18809236), rather
  than a new top-level Discussion comment. [Actual follow-up reply](https://github.com/deepseek-ai/deepseek-harness/discussions/5623#discussioncomment-18892793),
  **2026-10-13 03:09:19 UTC**, author `lemonxiny55`; GraphQL confirmed its parent
  is [the original thread](https://github.com/deepseek-ai/deepseek-harness/discussions/5623#discussioncomment-18809236).
  It announces `.ets` indexing/basic navigation, links the Release, states the
  SDK/HAR/state-update/rerender limits and invites a real HarmonyOS project trial
  with SDK version and parsing/reference feedback.

Only this evidence document is updated after publication; published files,
runtime and grammar remain identical. `HANDOFF_PROMPT.md` remains untracked,
excluded and unchanged (SHA256
`05D2BE1390A73D588EF6461DF8BA583ABFB86F771581009DA647FCA3244D5034`).
No DSH Host or third-party extension was modified. No remaining release blocker.

## Historical stable candidate preflight (superseded by publication above)

**RELEASE READY — final local stable-candidate gate passed; remote CI and public
publication pending separate authorization.** Current package is **0.10.0**.
There are no runtime/grammar/dependency changes from implementation `1158f54`;
this follow-up changes release metadata, documentation and the smoke script's
optional tarball input so both Node versions test the same immutable archive.
No public or remote write is authorized or performed in this preflight.

- Candidate: `.dsh-code-index/release-v010/dsh-code-index-0.10.0.tgz`.
- Version **0.10.0**, **19 files**, **413482 bytes** (3140227 unpacked).
- SHA256: `0EA5E02E577F347CBD4437782BE4CAF160716BB8D77C3B6518E59EBE107C06A2`.
- SHA1: `6799616b61e8146cd90c2b184dcf16febbade70e`.
- Integrity: `sha512-xde+T4IFDXx3HbcE0z4VEbqAF47VXgRedpiupVafbfHRzjnK5IEcXh3oHpwlKVzkfOpUv8pbQxMcCedXej6dTA==`.
- [Full inventory/per-file hashes](assets/package-v0.10.0-preflight.json).
  All archive paths/sizes/hashes match the retained genuine npm consumer install.
  Manifest, both READMEs, current CHANGELOG entry and smoke contain no dev-version
  marker. Historical development versions below are retained as dated evidence.

Node **22.23.3** and **24.19.0** each freshly passed **25 files / 235 tests /
0 failures**, typecheck, server/declaration build and client build. The installed
stable archive passed `release-smoke.mjs <same tarball>` on both: `.ets` parsing,
mixed index, actual decorated component source and imported callee in the pack,
JSON budget, external add/edit/delete, diagnostics, Issue #2 whitelist and existing
tool/registration/full/compact/disposal checks. The script did not rebuild or
delete the supplied candidate. Reports/logs are retained under the candidate
directory. No old test result is treated as a stable-version run.

`npm publish <same tarball> --dry-run --ignore-scripts --tag latest
--registry https://registry.npmjs.org` returned exit **0** and identified
`dsh-code-index@0.10.0`, 19 files and the same SHA1/integrity. This was explicitly
a **dry-run**, not npm publication or authentication/2FA verification.
The runtime SHA256 is still `5B7B9225E094929B059AC0B438AAF1D37F898FD0F3E78FCD98105E6BB1D89754`.

Desktop uses a regular target-plugin directory copied from a real npm install of
this archive, with all 19 files matched. Only its dependency directory points to
the isolated consumer installation. After validation the original workspace
junction was restored, and the tested install retained separately. Profile
`cordis.yml`, `package.json` and `pnpm-lock.yaml` SHA256 values matched the
pre-install snapshot. No DSH Host/third-party code or enable states were changed.

### Installed stable-package Desktop Agent gate — PASS

Session **`session-2c22a624-2208-4b37-817d-48f3030bfe21`**, 2026-10-13, existing
Desktop `desktop` profile/model NVIDIA `deepseek-ai/deepseek-v4.1-flash`.
The app was quit before replacing only the target plugin, then launched after
the genuine stable npm installation was copied in. This was Windows Computer Use
submitting a real model-backed turn, not a manual human check or direct handler
invocation. Persisted events establish **5 calls / 5 successful results / 1
completed turn**: code_index, code_symbols, code_refs and two code_context calls.
No read/grep/terminal/edit/other tool executed.

The bounded fixture has two files: V2/Local/Builder component `Counter.ets` and
business helper `logic.ts`, local Git baseline
`30a7a9097f77d488919d2238f133bcf4096dafab`. It is a minimal synthetic fixture,
not presented as an official HarmonyOS project or accuracy benchmark.

| Required result | Actual stable-package Desktop evidence |
| --- | --- |
| ETS indexing/location | 2 files / 5 symbols; arkts and typescript; `StableCounter` at `Counter.ets:3` |
| Accurate component source | Complete `Counter.ets:3–18` includes ComponentV2, Local, Builder and nested UI |
| Basic mixed references | `stableLabel` definition `logic.ts:1`; callers `Counter.ets:9 in heading`, `Counter.ets:15 in build` |
| Honest provenance | Two exact `explicit-import-binding` edges; import statement is import-scoped; `this.heading()` stays name-only/global-name |
| Source evidence | 3 returned ranges independently matched actual fixture lines: full component, full TS helper and import statement |
| Strict rendered budgets | **2021/5000** and **359/500** characters; small pack explicitly signature-only with budget gap |

[Filtered stable Desktop events and source audit](assets/desktop-v0.10.0-stable-tool-evidence.json)
retain the exact candidate SHA256, model, calls, results, fixture snapshot and
per-range checks. Unrelated conversations, system prompts and request schemas
are excluded. Final model prose is not used as verification evidence.
Desktop exposes rendered pack text; serialized JSON caps are verified separately
by actual installed-consumer smoke on both Node versions. No extra Desktop
freshness matrix or HarmonyOS compiler/device run is claimed.

No target-plugin blocker, host/runtime failure or third-party failure was observed
in this final gate, so extension isolation/framework investigation was unnecessary.
The prior dependency-link sandbox restriction was avoided using normal filesystem
access for Node verification. Dry-run does not verify future publication auth/2FA.

### Release boundary

Local verification **RELEASE READY**. The same stable archive is retained for the
authorized next phase. It is suitable for remote **development-branch push and
Node 22/24 CI**. The existing workflow runs on PRs or main pushes, so a development
branch push alone does not trigger it; opening a PR is a later authorized action.
The exact release commit must pass remote CI before main/tag/npm/
GitHub Release actions are authorized and executed. No remote write, main push,
tag, npm publication, GitHub Release or Discussion promise occurred here.
No new functionality or refactor was introduced. `HANDOFF_PROMPT.md` remains
untracked and unchanged. The original target-plugin junction/configuration is
restored after the gate; the tested installation is retained separately.

## Historical development gate (superseded by the stable preflight above)

**RC READY for maintainer review; publication is pending.** Package version is
`0.10.0-dev.0`. This is a development candidate, not a published v0.10.0 release.
The branch is `codex/arkts-v0.10.0`, based on latest fetched main
`1fffc47da40e5506f0e96a59e059582f8caeb77c`. Implementation commit: `1158f54`.
No main push, v0.10 tag, npm publish, GitHub Release or Discussion reply occurred.
The published v0.9.1 evidence, notes and tag are unchanged. The existing untracked
`HANDOFF_PROMPT.md` is preserved, SHA256
`05D2BE1390A73D588EF6461DF8BA583ABFB86F771581009DA647FCA3244D5034`.

## Minimal observable gate

Use authentic ETS sources to establish that the existing web-tree-sitter runtime
loads an ArkTS grammar, extracts component/business declarations with accurate
owners and ranges, and supplies actual source through Context Packs. A tiny mixed
ETS/TS fixture establishes static import provenance, UI false-match exclusion,
Git changes, external add/edit/delete freshness and whitelist continuity. Run
existing language regressions, Node 22/24 typecheck/build/tests and actual package
installation. Attempt a bounded real Desktop Agent check on a small official
HarmonyOS project. Do not validate HarmonyOS runtime semantics or modify the host.

## Grammar decision and implementation

Selected harmony-contrib/tree-sitter-arkts **0.3.0**, MIT, commit
`9a97c1e6ac93bc07732c15050a0e560bc63c8d78`. The published npm archive's SHA512
was independently checked; its unchanged **ABI-14 WASM** and complete license
notices are vendored in `grammars/`. Runtime does not import the native addon or
run its install script. [PoC comparison](ARKTS_POC_v0.10.0.md) records why the
Million-mo candidate was not selected and explicitly does not claim a runtime
pass for that candidate. [Asset provenance](grammars/README.md) locks source,
archive integrity, WASM hash and upstream build method.

PoC: all seven ETS/TS sources from official OpenHarmony Browser plus all 15
TypeScript-fenced snippets from the official `@Local` document. Pins, file hashes
and line counts are retained in [the corpus](tests/fixtures/arkts/official/README.md).
**22 inputs, zero ERROR/MISSING on Node 22 and 24**; two snippets are explanatory
fragments, not complete applications. No syntax repair or success-only selection.
This finite observation is not a claimed language-wide accuracy percentage.

Implementation extends the scanner, dedicated ArkTS queries, stable symbol
owners, decorator metadata/ranges, static mixed imports and existing tool paths.
Structs use existing `class` IDs/signatures. Unbound capitalized UI calls have
no global-name/module fallback; UI attribute chains, decorators and leading-dot
styles are excluded from runtime relationships. Explicit named imports keep
existing provenance; default import aliases remain import-scoped; ambiguous
ETS/TS stems stay unresolved. No inferred state-update/rerender graph is added.

Lightweight per-file diagnostics record parsed/partial/failed status,
ERROR/MISSING counts and at most three locations. Read/parser failures retain
failed file records and retry on subsequent scans; unreliable ArkTS declarations
are omitted. `code_index`, change context and Context Pack gaps report bounded
incompleteness; small packs reserve the summary. Cache schema 3 rebuilds older
persisted caches. This is syntax/read completeness, not semantic completeness.

## Automated verification — 2026-10-12

| Check | Actual method | Result |
| --- | --- | --- |
| Node 22.23.3 | Official Windows Node ZIP; complete Vitest JSON report | **25 files, 235 passed, 0 failed** |
| Node 24.19.0 | Official Windows Node ZIP; complete Vitest JSON report | **25 files, 235 passed, 0 failed** |
| Typecheck, both | `node node_modules/typescript/bin/tsc --noEmit` | PASS |
| Build, both | tsup server/declarations, then client config | PASS |
| Real pack/install, both | `node scripts/release-smoke.mjs`: npm pack and disposable consumer install | PASS |
| Installed ArkTS | Smoke loads installed WASM, extracts mixed ETS/TS, returns decorated component and exact imported callee source, tests external add/edit/delete and incomplete status | PASS |
| Existing languages/Gitignore | Complete existing suite plus installed Issue #2 smoke | PASS |
| Diff whitespace | `git diff --check` | PASS; pinned official fixture whitespace/bytes intentionally preserved by scoped attributes |

There are **15 added ArkTS tests**, in `tests/arkts.spec.ts`, over the previous
220-test suite. They cover V1/V2, Builder/global business declarations, nested UI,
Unicode/duplicate owners/stable IDs, ERROR/MISSING reporting, built-in/modifier
false associations, both ETS→TS and TS→ETS imports, weak default provenance,
ambiguous stems, SDK namespaces, exact source ranges and 300/500/1500/5000-char
budgets, Git current/base changes and affected tests, cached diagnostics, handler
freshness/whitelist changes and independent background watcher freshness.

Local reports are retained in ignored `.dsh-code-index/arkts-poc/tests-node22.json`
and `tests-node24.json`. Dependencies and `pnpm-lock.yaml` are unchanged. The
Node archive SHA256 checks matched official `SHASUMS256.txt`:

- Node 22: `2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71`.
- Node 24: `57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73`.

Final follow-up on **2026-10-13** reran typecheck and the complete suite on both
versions: **25 files / 235 passed / 0 failed each**. Reports are retained as
`tests-final-node22.json` and `tests-final-node24.json` beside the earlier reports.
The testing scope is now explicitly `tests/**/*.spec.ts`, with at most four
workers. The first unrestricted follow-up inadvertently discovered copies in the
isolated-install/cache directories; after bounding discovery, one existing
Gitignore test exceeded the default 5-second test timeout under full concurrency
and passed individually. Limiting workers resolved the complete-suite run without
changing assertions or watcher freshness timeouts. Both final package-consumer
smokes passed again; npm's prepare hook rebuilt server/declarations and client.
No plugin runtime edit was needed, and its verified bundle hash remains unchanged.

Final retained development archive (after README/CHANGELOG updates):
`.dsh-code-index/arkts-poc/dsh-code-index-0.10.0-dev.0.tgz`, **19 files / 413381
bytes**. SHA256:
`C04521CF18CFCB9E95FC3BAC723973B51D333E996482761652501FFEB7E10909`.
It includes the WASM, both grammar notices/provenance and compiled declarations;
tests, release evidence, session audit and `HANDOFF_PROMPT.md` are excluded.
The final inventory/integrity is retained as `pack-final.json` beside the archive.

No remote CI result is claimed. On 2026-10-13, an independent install using the
unchanged lockfile passed with bundled pnpm 11.25.0, `--ignore-workspace`,
`--frozen-lockfile`, `--ignore-scripts` and a workspace store (122 packages).
Its typecheck passed with ordinary filesystem access. Initial attempts hit local
global-store/workspace/Corepack setup or sandbox `realpath` restrictions. A later
sandboxed typecheck reported missing inherited `ToolDefinition.name` on both the
working checkout and the isolated install; the identical isolated check passed
outside the sandbox. This single isolation result classifies it as dependency-link
read access in the execution environment; no host/framework investigation or
third-party code modification followed. The initial npm PATH/cache failures were
resolved using the verified Node ZIPs and a workspace npm cache. Actual disposable
npm consumer installations passed on both versions. These observations are
separate from target-plugin blockers.

Verified runtime `dist/index.js` SHA256:
`5B7B9225E094929B059AC0B438AAF1D37F898FD0F3E78FCD98105E6BB1D89754`.
ArkTS WASM SHA256:
`A5FBF24B2EEAB43CF60E9FCDBDE99E9089F7CEAE43134D24E1D5CC166D285446`.

## Real DSH Desktop Agent — PASS for bounded source retrieval

On **2026-10-12**, Windows Computer Use opened the existing Desktop app, quit
and relaunched it after the final runtime build, and submitted a new bounded
read-only conversation. This was a **model-backed Desktop Agent**, not a manual
human check or direct handler invocation. Existing `desktop` profile and its
workspace junction loaded `0.10.0-dev.0`; the junction's runtime file hash matched
the verified build above. No profile/package/extension-enable-state changes.

Model: configured NVIDIA `deepseek-ai/deepseek-v4.1-flash`. The development work
was performed in Codex; the Desktop model is an independent compatibility target.
Session: `session-0c6b4ae5-ebb5-4ff0-8085-a31d69ef071a`.
Persisted events prove **3 tool calls, 3 successful results, 1 completed turn**:
`code_index`, `code_symbols`, `code_context`. No other tools executed.

The fixture is a copy of official `device/Browser`, upstream commit
`508cda899cc6a6df9c0c6fb6aecec3c275337606`, with project configuration retained.
Local disposable Git baseline: `15b474900a26b2ec400d518e80acdafb2c5b7fa8`.
Git line-ending normalization does not change the syntax. The full project has
**9 indexable files / 101 symbols**, including its two JS project scripts.

| Observable result | Actual tool result |
| --- | --- |
| ArkTS identified | Index languages: javascript, typescript, arkts |
| Component range includes decorators | `Index.ets:24-29` contains `@Entry`, `@Component`, `struct Index`, State fields; mode explicitly `window` |
| Declarative build source | `Index.ets:32-46` returns the **complete build method**, nested Flex, conditional custom components and attribute chains |
| Related component context | PhoneLayout declaration/state window and build window, plus TitleBar build excerpts |
| Source evidence | **7 ranges independently matched actual fixture lines**; 2 complete methods, 5 explicit windows |
| Reasons and budget | Inclusion reasons present; **4365/5000 rendered characters**, budget omission and no-related-test gaps explicit |

Filtered event evidence and per-range hashes are retained in
[assets/desktop-v0.10.0-tool-evidence.json](assets/desktop-v0.10.0-tool-evidence.json).
Raw system prompts, unrelated conversations and request tool schemas are excluded.
The final model reply is not used as proof; the tool outputs are audited directly.

Limitations of this actual Desktop check: it used the workspace **development
build**, not a tarball installed into Desktop. Desktop exposes pack output as
rendered text; structured-object budgets/provenance, real Git change context and
external freshness are separately covered by unit/installed-consumer tests.
No relationship-provenance item survived this particular pack budget, so no live
Desktop provenance proof is claimed. There was no new Desktop add/edit/delete
round, HarmonyOS compilation or device execution. No host/third-party runtime
failure occurred; ecosystem isolation/debugging was unnecessary.

## Historical development decision and remaining work

No known ArkTS implementation blocker was observed in this bounded gate.
Known language/resolution limits are documented in both READMEs. No performance
or accuracy percentage is claimed. Recommend proceeding to a **v0.10.0 release
preflight**, after maintainer review/authorization, rather than publishing this
development package as the stable release.

Before a stable release, finalize the `0.10.0` version/artifact and perform its
candidate-specific checks and remote Node 22/24 CI. The Desktop check above
proves the current runtime; it is not a claim that a final stable archive has
been Desktop-installed. Draft bilingual [release notes](RELEASE_NOTES_v0.10.0.md)
are prepared. Main, tag, npm, GitHub Release and Discussion remain untouched.
