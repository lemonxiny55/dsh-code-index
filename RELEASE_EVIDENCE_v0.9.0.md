# v0.9.0 — Edit-ready Context Packs

**STATUS: RELEASE READY — npm published on 2026-10-05**

Automated/native verification on 2026-10-04; real Desktop Agent verification
on 2026-10-05. Implementation branch: `codex/v0.9-context-packs`.
Starting main: `15d515368e438b726a0cc0a5fbff063600712641` (local main and
GitHub main matched at the start). At validation closeout, no publish, tag,
GitHub Release, or push had been performed. The pre-existing untracked
`HANDOFF_PROMPT.md` was preserved.

## Publication follow-up — 2026-10-05

The user manually published `dsh-code-index@0.9.0`. The public npm registry
returns version `0.9.0` with shasum
`ca6294d5497d3add709162604892dfd97c5874ac` and integrity
`sha512-X+2Uf4z8C9XG6UQraCfMTmLeP0FMI/hnndlz1PWAHYHaoRz09VIytcZu959f1X/x7b5UcsE8vGgq7yDQByjnkQ==`,
matching the exact tarball verified in the Desktop gate below. No second npm
publication or version overwrite was attempted. The final publication follow-up
updates only README/CHANGELOG/release-state documentation; the implementation
remains the verified candidate `5dc939b7805a2b46c569fa6eca75cc4153e94be9`.
The immutable npm tarball retains the documentation captured before publication;
the repository documentation now reflects the published state.

Fresh local verification before integration: **22 files / 215 tests PASS**,
**typecheck PASS**, and **build/pack/disposable-install smoke PASS**. The published
tarball's 14-file inventory and compiled runtime checksum were also checked.
The remote main remained at the starting commit. Main/CI/tag
and GitHub Release are separate release operations; their final result is
reported after the CI gate. GitHub repository description was updated and read
back successfully with the exact user-approved wording.

## Minimal success conditions and scope

A tiny Git fixture must return the primary source and related evidence in one
`code_context` call, with correct current/base ranges, honest reasons and
relationship labels, and bounded text/JSON. A reliable baseline must classify
betaCaller as added rather than modified. Two distinct fixture repositories,
one real worktree, and external filesystem writes must preserve isolation and
freshness. Full/compact surfaces and default canonical text calls must remain.

Fault layers were kept separate: this plugin's selection, classification and
peer-resolution defects were fixed; sandbox/build access and clean-host model
setup were recorded as environment issues. No host or third-party plugin code
or existing user profile was modified.

## Implemented P0

| Requirement | Result |
| --- | --- |
| Bounded source excerpts | PASS — primary declarations, strong caller/callee source, used imports including multiline imports, likely test windows and Git changes. Whole declaration → whole-line bounded window → signature-only metadata. No whole-file dumping or mid-code character slicing. Large changed declarations focus on the first changed line and retain signature metadata. |
| Unique final ContextPack | PASS — candidates are selected before final presentation. Text and explicit pack output consume the same selected DTO. Legacy result metadata is filtered to selected items. Overlapping source lines are removed independently per file/side/ref. |
| Hard budget | PASS — default 5000; normalized range 300–20000. Both text and serialized pack are capped. Used text and JSON counts are checked. Task display is summarized without changing routing; oversized identity errors and failure diagnostics remain explicit and bounded. |
| Inclusion evidence | PASS — concise per-item reason, separate relationship resolution/provenance, retained exact/import-scoped/name-only labels. No probability/confidence score in the final pack. |
| Change classification | PASS — reliable frozen commit baseline distinguishes added/modified/deleted, including betaCaller and mixed replacement hunks. Missing/ambiguous baseline identity is unclassified. Reliable file rename is retained; symbol rename is not guessed. Explicit files/symbols retain their historical selection-mode semantics. |
| Minimal recall | PASS — camel/snake terms, filename/path/signature terms, exact-symbol retention even among many exported prefixes, bounded neighborhoods prioritizing strong edges, clean-tree likely tests from strong primary seeds. Unrelated dirty files and unused imports are excluded. |
| RC compatibility | PASS for the tested native runtime and package paths — matching dsh-tools 0.2.0-rc.2 plus its matching peers, Cordis 4.0.4. Runtime validates arguments/output, dispatches actual source-returning calls, and preserves string default vs explicit object output. |
| Product/docs | English/Chinese first-screen value and API docs synced; package description updated; outdated local-variable/four-tool claims and missing internal bench-plan references cleaned up; historical benchmark pins labeled. Reproducible real local 30-second demo included. Remote GitHub description remains pending authentication. |

Source bodies remain ephemeral, outside the persisted schema-v2 index. Current
reads reject root-escaping realpaths, post-snapshot modifications, and files
over 1 MB. Missing evidence uses signature-only items/gaps. Likely tests remain
retrieval leads rather than a coverage guarantee.

## Final automated checks

| Check | Method and result |
| --- | --- |
| Node 24.19.0 suite | PASS — `node node_modules/vitest/vitest.mjs run`: 22 files, 215 tests. |
| Node 22.23.3 suite | PASS — same Vitest entry under the official Windows Node 22 binary: 22 files, 215 tests. ZIP SHA256 checked against official SHASUMS before use. |
| Typecheck | PASS — `node node_modules/typescript/bin/tsc --noEmit`. |
| Build | PASS — Node 22-targeted ESM, public `dist/index.d.ts`, browser client bundle. Declaration worker has a scoped TypeScript 6 deprecation opt-in. |
| Frozen lockfile | PASS — `pnpm install --ignore-scripts --frozen-lockfile` with workspace store; 196 entries passed installed supply-chain policy checks. |
| Pack / smoke on Node 24 | PASS — `scripts/release-smoke.mjs`: real npm pack, disposable tarball install, required files including declarations, actual installed dsh-tools RC version, all full tools/compact tools, text/pack calls, source payload, hard cap and disposal. |
| Pack / smoke on Node 22 | PASS — same final script and tarball path under Node 22, npm 10.9.9. |
| RC native pipeline | PASS — `tests/compat.spec.ts` uses the real RC ToolRuntime with a minimal systemPrompt service stub. Schema rejection and successful source-returning text/pack calls verified. This is not a real Agent or model-backed Web test. |
| Diff whitespace | PASS — `git diff --check`. |
| Demo | PASS — actual local execute/render calls recorded over 30.0 seconds; browser replay reached completion. Last text output 376/500 characters; change pack JSON 2855/5000. No model, external API request, Card mock, or benchmark result. |

The initial sandbox build failed when esbuild tried to read parent directories.
The same build/pack scripts passed with approved normal read access. pnpm's
default store had a local database access issue; the workspace store worked.
These observations were not investigated as DSH host/plugin defects.

A fresh-install regression exposed an important package issue: the old broad
peer range let npm choose registry `latest` dsh-tools **0.0.1-rc.1**, despite
the development pin. The final peer is exactly **0.2.0-rc.2**, and the smoke
asserts the actual installed version. Older DSH APIs are not promised by v0.9;
upgrade the host version group together. This does not change the v0.8 config
or default text/tool-surface compatibility contract.

## Context quality contracts

**17/17 PASS**, on both tested Node versions. Each fixture uses explicit
`mustInclude`, `forbiddenNoise`, `requiredReason`, `requiredProvenance`,
`expectedSource`, and `budget` contracts in `tests/context-quality.spec.ts`.
Code evidence is compared to the actual current file or frozen Git baseline;
overlap and serialized accounting are checked, not just output snapshots.

| Fixture | Evidence checked |
| --- | --- |
| Exact symbol | Named source, exact inclusion reason, strong relation, no unrelated same-file declaration. |
| Natural-language bug | Config/loading term recall; unrelated widget excluded. |
| Clean-tree likely test | Test file and actual test call window; import-scoped reason/provenance. |
| Signature/path terms | Parameter/path retrieval and actual primary source. |
| Architecture | Deterministic config entry source, with reasons and bounded scope. |
| Exploration | Same task-related source leads, without widget noise. |
| Ambiguous task | Explicit missing-primary gap; no invented source evidence. |
| Hard budget | 500-character final text and JSON accounting. Other tests cover 300/2000/5000 and error budgets. |
| Current change/classification | Added betaCaller, modified loadConfig, deleted removed, current/base source, frozen SHA even after HEAD moves. |
| A→B→A / external freshness | Distinct markers; subprocess add/change/delete; source body refresh without manual rebuild or cross-project leakage. |
| Worktree | Real Git worktree; worktree-only current source never appears in main checkout. |
| Oversized/overlap | Nested large declarations; whole-line windows and no duplicate source lines. |
| Post-snapshot stale source | Stale bodies are refused. |
| Large modified declaration | Changed line appears in the bounded window. |
| Used multiline imports / callee | Used import statement and exact callee; unused import noise excluded. |
| Exact non-exported symbol | Exact declaration survives many exported prefix candidates. |
| Strong-neighbor fan-in | Exact caller source survives a crowd of name-only callers; weak source bodies excluded. |

Existing change-context tests additionally retain file rename and unavailable
baseline coverage. Existing manager/tool tests retain watcher events, session
root resolution, cache identity, exclusion, and disposal coverage. Two focused
source-range tests and the normal tool text/pack/error tests complement the
quality suite. No model/performance benchmark was run or claimed.

## Conditional Web Card spike and stop condition

**Deferred; not included in v0.9.0.** No Context Card screenshot was fabricated.

The independently installed matching DSH 0.2.0-rc.2 CLI booted a new clean Web
profile under a separate workspace DSH_HOME. The browser reached the preview
notice and then the API-key/model setup page. This only proves clean host Web
startup. The target plugin was not executed by a real Agent in that profile;
there is no real tool/call, Card replay, or file-navigation evidence.

Stop condition: if real Agent validation requires new model credentials or
broader profile/host work, stop this optional branch and record the gap. No key
was read or configured; no existing profile or third-party extension was
diagnosed. This setup gap is not evidence of a plugin defect. Native runtime
and text/DTO gates continued, while Card/replay/clickable-file validation was
left for a later version. The demo is explicitly a local tool recording.

Other deferred candidates: BM25 (no fixture evidence requiring it), SQLite,
vectors/remote embeddings, LSP, new tool families, many new languages and large
graph visualization (explicit non-goals). No architecture rewrite or
third-party plugin fix was attempted.

## Real DSH Desktop Agent gate — 2026-10-05

**PASS.** This was a model-backed Agent session in the installed Windows DSH
Desktop, operated through its UI. It was not a unit test, a direct plugin
`execute()` call, or a mock. The session contains seven actual `tool/call`
events, each followed by a successful `tool/result`; every tool was
`code_context`. The Agent used the returned source to explain the tasks
without additional grep/read/terminal calls.

Session: `session-f4742e58-bc3f-4769-8362-95169f581a0e`.
Tested implementation HEAD: `bc1e83bc76ac636ae7ca385db1bd59f7c2c1bd53`.
The follow-up evidence commit changes documentation/artifacts only.

### Installation and actual runtime

- Real profile: `C:\Users\18439\.dsh\profiles\desktop`.
- The user confirmed installation was already complete and instructed us to
  validate only. Reinstallation was cancelled; the existing junction to the
  current branch was retained. No bundle enable states or model credentials
  were changed, and no host/third-party code was modified.
- Current branch `npm pack` rebuilt the ESM, declarations and browser client
  successfully. The newly packed `dist/index.js`, workspace build and installed
  junction target all have SHA256
  `FF84985D32E97B864B5B9E424E498AD72FFFEF1CE17AAEFFC192EA73AFFCBDC8`.
  Tarball SHA256:
  `EA01423BF6D8D295FBB68D16EC14B9B2AFEE54835C6A79DA5C51AF1C5B7F82B0`.
  This is verification of the existing branch installation, not a claim that
  the tarball was reinstalled into Desktop. The earlier disposable consumer
  install/smoke remains the separate packaged-install evidence.
- Desktop's own bundled CLI reports `0.2.0-rc.2`; read-only inspection through
  Electron's Node mode confirms its bundled `dsh-desktop-host` and `dsh-tools`
  are both `0.2.0-rc.2`. An old conversation's `0.1.7-alpha.2` installation
  description was stale and is not used as runtime evidence.
- A fresh typecheck also passed on 2026-10-05. The 215-test Node 22/24 suites,
  Native ToolRuntime and smoke results above are dated 2026-10-04; they were
  not rerun or presented as Desktop Agent verification.

### Representative task results

| Real Agent task | Observed result |
| --- | --- |
| `Explain selectContextPack budget selection`, no format/root/budget override | Default text succeeded. Session root was the actual dsh-code-index checkout. Primary source at `src/context-pack.ts:57-62`, reasons and related test leads were returned. **4026/5000** chars. Large-function evidence was a bounded opening window, with an explicit budget gap; the Agent acknowledged that further implementation detail would require a focused follow-up. |
| `Fix whitespace config loading bug`, explicit pack, clean tiny Git fixture | No function name supplied. Returned `loadConfig` complete source, `startup` caller source, related `tests/config.spec.ts` source, inclusion reasons and separate exact/import-scoped provenance. **1294/5000** chars. Git worked and correctly reported no changes. |
| `Review current changes`, explicit pack, same fixture after external edit | `loadConfig`: **modified**, current lines 1–3; `betaCaller`: **added**, current line 4; `removed`: **deleted**, base line 4 at frozen SHA `f19bfebc85b5fdc9ea41a261842b14264b6fe914`. Current source included `.toUpperCase()` and **DESKTOP_FRESH_090**. Caller/tests remained; exact/import-scoped/name-only relationship labels were preserved. **2326/5000** chars; no gaps. |
| `Explain loadConfig`, default text, 500 budget | **327/500** chars. Signature-only fallback with `budget omitted some evidence`; no arbitrarily sliced code body. |
| Return to `Explain selectContextPack`, no root/format override | Default session root returned to dsh-code-index, **4009/5000** chars. No fixture `betaCaller` or freshness marker leaked. This checks default-root recovery after explicit root overrides, not a new full Desktop worktree/switching matrix. |

The first temporary fixture was created by the sandbox account, so Desktop Git
reported dubious ownership while source retrieval still worked. One replacement
fixture was created as the desktop user; Git then worked. No global safe-directory
setting, ACL change, unrelated plugin isolation or host investigation was needed.
The two initial calls and their honest gap remain in the evidence.

Freshness was tested by writing the fixture file from outside DSH **after** the
clean-tree query. No plugin build, index rebuild command, app restart or manual
refresh occurred between that write and the change query.

Actual persisted tool records were audited afterward, independently of the
Agent's prose: **7/7** successful results, **7/7** actual rendered lengths equal
their reported usedChars and within budget, and **35/35** source ranges match
the applicable current file or baseline. The clean pre-edit source was compared
to the fixture baseline. The compact evidence contains only these tool records
and audit metadata, not the complete session/system prompts:
[Desktop tool evidence](assets/desktop-v0.9-tool-evidence.json).

Desktop's records store rendered tool text, including when the call explicitly
requests `outputFormat: "pack"`. This gate proves that pack calls execute and
render useful selected evidence through the real Agent. Canonical object shape
and serialized JSON hard-cap evidence remain the separately identified Native
ToolRuntime/automated checks; they are not inferred from the Desktop text.

No plugin release blocker was found. Web Context Card remains deferred and was
not reopened. Worktree/full switching coverage remains in the automated gate.
The Desktop gate is complete; no ecosystem diagnosis is needed.

## Backward compatibility and remaining work

- Full surface remains seven normal tools plus opt-in health; compact remains
  index/context plus opt-in health.
- Existing v0.8 configuration, Node 22/24, local-first operation, no external
  indexing key, repo/worktree isolation and live freshness remain covered.
- `code_context` returns a canonical string by default. Only explicit
  `outputFormat: pack` returns an object; Native rendering remains text.
- Reliable file rename and explicit change selection modes remain available.
- Package metadata and bilingual docs are ready. The initial GitHub description
  attempt returned HTTP 401; authentication now works and the publication
  follow-up successfully applied the user-approved description.
- No implementation/test/build/pack/Desktop blocker remains. **RELEASE READY**
  is supported by the separate automated, Native ToolRuntime and real v0.9
  Desktop Agent evidence. npm publication was performed manually by the user
  and verified in the publication follow-up. Previous v0.8 manual evidence is
  not substituted for v0.9.

The user subsequently authorized safe main integration/push, tagging and GitHub
Release creation after CI; npm publication remained the user's manual action.

## Commits and working tree

Implementation commits, oldest first:

```text
7079789 build: validate matched DSH 0.2.0-rc.2 runtime baseline
231217a fix: classify symbol additions and removals against Git baseline
afeca1d feat: attach inclusion reasons and find tests from primary seeds
b20fc3e feat: read bounded source ranges with current and base isolation
acb57c9 feat: select final ContextPack before rendering under hard budgets
c000410 feat: expose opt-in ContextPack output while preserving text default
d8ea0f1 feat: improve deterministic task recall and exclude unrelated dirty files
454dd9c test: enforce ContextPack quality contracts across repos and worktrees
05208de fix: freeze baseline refs and focus excerpts on changed lines
fd14d28 build: verify RC canonical outputs and ship public declarations
57ac9f3 fix: suppress file-only noise and unselected source metadata
20ab63c feat: include relevant multiline imports and declaration evidence
696a334 fix: prioritize strong relationships before bounding graph neighborhoods
7ec13ce build: pin consumer RC runtime and prepare v0.9 package metadata
6d8c17f fix: bound context failure diagnostics within the hard budget
f66f349 docs: present edit-ready packs with a real 30-second local demo
```

The implementation closeout was `bc1e83b`; the Desktop validation candidate was
`5dc939b`. A subsequent release-documentation commit records publication state.
Working tree at closeout: only the pre-existing untracked `HANDOFF_PROMPT.md`;
no implementation modifications left uncommitted.
At validation closeout, main stayed at the starting commit. The local Desktop-validation tarball is
retained under the workspace temporary evidence directory; no public release
artifact was created during validation. Publication is recorded separately above.
