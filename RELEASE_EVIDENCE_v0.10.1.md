# v0.10.1 compatibility release evidence — 2026-10-18

## Actual publication — RELEASED

**v0.10.1 formally released on 2026-10-18.** The maintainer explicitly authorized
PR #4 merge, post-merge main CI, npm publication, tag/Release and this evidence
update. No feature, production source, ArkTS grammar/WASM or license change was
introduced during publication. The local-candidate sections below are historical
records; their pending-publication wording is superseded by this publication record.

- [PR #4](https://github.com/lemonxiny55/dsh-code-index/pull/4) merged at
  **2026-10-18 03:58:45 UTC** with the exact-head guard
  `8efd5635876f715e2939d10594ecad815fea05dd`.
- Release/main merge commit: **`17cfb9796a274d5705fe5cb19964f9226028c370`**;
  parents are unchanged main `cc46057b87cf6e9bed6d317e982ed555ec4a1a34` and the
  verified PR head. The complete trees are identical,
  `32ff40a26aa29e43ac193bab58be0ca2a6721912`. No force push was used.
- [PR CI](https://github.com/lemonxiny55/dsh-code-index/actions/runs/39094607065)
  and [post-merge main CI](https://github.com/lemonxiny55/dsh-code-index/actions/runs/39095491158)
  passed for their exact respective commits.

| Post-merge Ubuntu job | Tests | Other checks |
| --- | --- | --- |
| [Node 22.23.3](https://github.com/lemonxiny55/dsh-code-index/actions/runs/39095491158/job/117580949549) | 25 files; 234 passed, 1 skipped, 0 failed | Frozen-lockfile install, typecheck, server/declaration/client builds, installed-package smoke passed |
| [Node 24.21.0](https://github.com/lemonxiny55/dsh-code-index/actions/runs/39095491158/job/117580949315) | 25 files; 234 passed, 1 skipped, 0 failed | Frozen-lockfile install, typecheck, server/declaration/client builds, installed-package smoke passed |

The skip is the existing Windows-only cache-key casing test. Both main jobs
logged `release smoke passed for dsh-code-index@0.10.1 with dsh-tools@0.2.1-rc.2`.
An additional fresh Windows full-suite run passed all 235 tests before merge.
The two supported RC runtimes and Node 22/24 local installation matrix remain
covered by the historical candidate evidence below.

### Main build, npm publication and registry archive

From the actual release commit, the server, declarations and browser bundle
were rebuilt and npm-packed into a separate directory. The resulting archive
is **byte-for-byte identical** to the retained original candidate, SHA256
**`4861daae474d1e975a97d5ac0f6240841bd0c253b3b51b013f289c654063207a`**.
All 19 extracted file paths, sizes and SHA256 values match
[the frozen inventory](assets/package-v0.10.1-preflight.json), including manifest
version **0.10.1**, complete peerDependencies, ArkTS WASM and license resources.
No unexpected package difference was found. Linux CI builds its own archive;
no byte-identity claim is made for an archive not exported by those jobs.

Before merging and immediately before publication, npm 0.10.1 returned 404,
`latest` was 0.10.0, and remote v0.10.1 did not exist. Initial `npm whoami`
returned E401; the maintainer completed npm login and later the publication
browser/2FA authorization personally. No credential, token or OTP was requested
or recorded. `npm publish <original candidate tarball> --ignore-scripts --tag
latest --access public --registry=https://registry.npmjs.org` ran **once** and
returned exit **0**. Registry processing briefly returned 404; publication was
not repeated.

- [npm dsh-code-index@0.10.1](https://www.npmjs.com/package/dsh-code-index/v/0.10.1)
  verified available, registry **latest = 0.10.1**.
- [Actual registry tarball](https://registry.npmjs.org/dsh-code-index/-/dsh-code-index-0.10.1.tgz)
  independently downloaded and checked: **19 files / 414619 bytes**, the same
  SHA256 above, SHA1 **`c3aefc2eaf4c30ec011faa2446a6a7cae2697b63`**, and matching
  SHA512 integrity. Every extracted file matches the original candidate and main
  build; the registry archive is byte-identical to both.
- Peer remains exactly **`0.2.0-rc.2 || 0.2.1-rc.2`**; no new host version was
  added. Published v0.10.0 was not modified or overwritten.

### Tag, GitHub Release and documentation

Annotated tag **v0.10.1**, object `c24285969afb2b1e6ef23089a20968075cec7b12`,
peels to **`17cfb9796a274d5705fe5cb19964f9226028c370`**. It was created and
pushed once without replacing an existing tag.
[GitHub Release v0.10.1](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.10.1)
was published at **2026-10-18 04:04:24 UTC** (12:04:24 Asia/Shanghai), non-draft
and non-prerelease, targeting the release commit above. Its body was read back
and matched the prepared English/Chinese notes with actual publication and CI
results. No release commit or tag was rewritten after publication.

Both READMEs, CHANGELOG and release notes were synchronized to released status
after registry and GitHub verification. This follow-up only records publication
and documentation; the published archive and release tag remain immutable.

### Post-publication Desktop check and repository boundary

Computer Use revisited the actual **DSH Desktop 0.2.1-rc.2** plugin details after
npm and GitHub publication: **dsh-code-index v0.10.1 / 1 component running**,
with no incompatibility warning. A separate read-only hash check matched all
19 files of the retained genuine candidate installation to the now-verified
registry archive. This reuses the same installed bytes and the real Agent evidence
below; no reinstall, restart, additional model turn or broad runtime matrix was
needed. No DSH Host or third-party code/configuration was modified during release.

`HANDOFF_PROMPT.md` remains unchanged and untracked, SHA256
`05d2be1390a73d588ef6461df8ba583abfb86f771581009da647fca3244d5034`.
The publication follow-up changes only documentation/evidence. Its later main
commit is not the release-tag target; the release target remains `17cfb979…`.
There is no remaining release blocker.

## Historical local candidate preflight

The following local-gate and environment notes describe the pre-publication
state. Actual publication results above take precedence.

## Scope and root cause

Branch `codex/dsh-0.2.1-compat-v0.10.1` was created after fetching latest main,
`cc46057b87cf6e9bed6d317e982ed555ec4a1a34`. AGENTS.md was read first.
The minimal gate is activation plus code_index/code_search/code_context, ArkTS
source and Context Pack output, required client presentation, old RC regression,
Node 22/24 tests/builds and installed-candidate smoke. No v0.11 work was added.

Desktop's actual `@deepseek-ai/dsh-app-boot@0.2.1-rc.2` checks compatibility
**before loading a bundle**. An own `engines.dsh` takes precedence; otherwise
every `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer must satisfy the runtime
version (`semver.satisfies` with prereleases enabled). v0.10.0 declares only
`dsh-tools: 0.2.0-rc.2`, so Desktop 0.2.1-rc.2 rejects it without executing it.

The real installed evaluator reproduces that rejection, with `exempted: false`.
The candidate accepts **only `0.2.0-rc.2 || 0.2.1-rc.2`**. Negative checks reject
0.2.1-rc.1, 0.2.1 and 0.3.0. No exemption or Host patch was used.

## Actual API comparison

Compared the npm 0.2.0-rc.2 artifacts used by the development runtime with the
0.2.1-rc.2 registry artifacts and installed Desktop asar modules. Desktop is
**0.2.1-rc.2**, build `332895e0f7c9d4dbfb29729f5eb367fa263ff986`, clean;
its dsh-tools runtime matches the registry JS hash byte for byte.

| Plugin-used API | Observed difference and compatibility result |
| --- | --- |
| defineTool, parameter/output schema, tools.register/execute | Relevant signatures retained. New RC removes ToolPresentationMode `both`; plugin does not configure it. Nested PTC presentation metadata is additive. Both exact RC pipelines execute the installed candidate. |
| output.render and presentationMeta | Signatures retained; new RC applies metadata to nested calls too. Real Desktop code_search persists matching file/line metadata; native installed-consumer checks retain structured values and metadata. |
| systemPrompt.section and session header cwd | Section registration/provider contract retained. New upstream context orders, required runtime contexts and refreshContext do not change the plugin's section API. No runtime adaptation needed. |
| settings.configure({auto:false}, fiber), lifecycle disposers | Old/new settings JS are byte-identical (SHA256 `9432b872597b7a31473072eb38a55979ab23375c76bd1d86d751388a692a0136`). Actual activation and settings-tab registration succeed. |
| slots tool.call.toolview / settings.plugins.tab, configForms, locale | Old/new tool-card owner still provides toolName/block/openFile; settings tab keeps id/order/label/inject. Locale register contract retained. Client settings tab is present in actual Desktop; UI checks below bound the presentation claim. |

**No production source change is required.** Only package version/peer constraint,
bilingual documentation, and release verification script changed. The development
pin and pnpm lock stay on 0.2.0-rc.2 for backward API typechecking. All 10 shipped
dist/grammar/license/bundle files are byte-identical to the published v0.10.0
inventory, including source maps and declarations. ArkTS support is unchanged.

## Candidate and package gates

- Version: **0.10.1**, unpublished stable-version candidate.
- Archive: `.dsh-code-index/release-v0101/dsh-code-index-0.10.1.tgz`.
- **19 files / 414619 bytes**; unpacked 3145285 bytes.
- SHA256: `4861daae474d1e975a97d5ac0f6240841bd0c253b3b51b013f289c654063207a`.
- SHA1: `c3aefc2eaf4c30ec011faa2446a6a7cae2697b63`.
- [Inventory and per-file hashes](assets/package-v0.10.1-preflight.json).
- Runtime SHA256: `5b7b9225e094929b059ac0b438aaf1d37f898fd0f3e78fcd98105e6bb1d89754`.
- ArkTS WASM SHA256: `a5fbf24b2eeab43cf60e9fcdbde99e9089f7ceae43134d24e1d5cc166d285446`.

| Fresh local verification | Node 22.23.3 | Node 24.19.0 |
| --- | --- | --- |
| Typecheck | PASS | PASS |
| Full test suite, old RC development dependencies | 25 files / 235 passed / 0 failed | 25 files / 235 passed / 0 failed |
| Server + declarations + browser build | PASS | PASS |
| Same archive installed with dsh-tools 0.2.0-rc.2 | PASS | PASS |
| Same archive installed with dsh-tools 0.2.1-rc.2 | PASS | PASS |

Each smoke performs a real npm consumer installation of the archive plus the
selected exact tools RC. It checks resources, full/compact registration/disposal,
ETS parsing/source/provenance/JSON budget, external add/edit/delete and Issue #2
whitelist behavior. The added final check uses that consumer's actual Cordis and
ToolRuntime for code_index, code_search and text/pack code_context; successful
values and presentation metadata pass schema/dispatch/rendering. This is not a
mock-host or manual Desktop claim. Invoke with:

```sh
node scripts/release-smoke.mjs /absolute/path/to/dsh-code-index-0.10.1.tgz 0.2.0-rc.2
node scripts/release-smoke.mjs /absolute/path/to/dsh-code-index-0.10.1.tgz 0.2.1-rc.2
```

Remote CI was not run. Old 0.2.0-rc.2's **real tool runtime** was regressed on
both Node versions; no downgrade or repeat old Desktop binary UI gate is claimed.

## Real installed-candidate Desktop gate

The app was quit before replacing only the target plugin directory with a regular
copy from a genuine npm installation of the exact archive. All **19 installed
files match**; only its dependency directory points to that isolated consumer.
The original workspace junction was backed up. Desktop's actual `desktop`
profile reports **v0.10.1 / running**, with the incompatibility warning gone.

Session **`session-7e99e153-9b08-42b3-b407-6b686a741ff0`**, NVIDIA
`z-ai/glm-5.3-flash`: real model-backed Desktop turn, **4 calls / 4 successful
results / 1 completed turn**. Only code_index, code_search and two code_context
calls ran. The successful GLM retry was submitted through the Desktop UI;
it is not attributed to this task's automated submission of the earlier failed
request. Computer Use inspected the app and persisted events were independently audited.

| Observable | Actual result |
| --- | --- |
| Activation | Candidate version displayed, target component running |
| code_index | 2 files / 5 symbols / arkts + typescript / up to date |
| code_search | CompatCounter at Counter.ets:2; persisted file/line match metadata |
| text and explicit pack | Both render actual @ComponentV2/@Local/@Builder component, TS helper and import source; reasons and explicit-import-binding provenance |
| Source and budget | 6 returned ranges independently matched fixture lines; both rendered outputs 1860/5000 characters |
| Client settings | Actual Code Index tab/card renders Chinese labels, current values and writable controls; map file count draft 24 → 25 → discard returns 24 and disables Save, without committing a settings change |
| Client result card | Expanding the real code_search call shows the plugin card, tool name, query=CompatCounter and the actual result text/file/line; file navigation and structured search-card behavior are not newly claimed |

[Filtered tool events, fixture snapshot and source audit](assets/desktop-v0.10.1-tool-evidence.json)
exclude system prompts and unrelated conversations. Final model prose is not used
as proof. The fixture is synthetic, not an SDK/compiler/device accuracy test.
Desktop exposes rendered pack text; structured-value JSON budget is verified by
the separate installed-consumer runtime smoke. Existing ArkTS SDK/HAR/state and
file-navigation limitations remain; no new feature or performance claim.

## Environment notes and release boundary

The first Desktop session (`session-59ad58dd-e6fa-422b-af7d-ba11adcd8014`,
NVIDIA deepseek-v4.1-flash) failed in model transport with `TRANSPORT / Connection
error`, zero tool/call events. This is outside the target plugin. A single
model-free profile-probe attempt was also discarded: the probe incorrectly
assumed root-context service access and executed zero tools. It is not passing
evidence or a plugin defect. The successful real Desktop GLM turn above supersedes
that probe; no further host/profile/third-party diagnosis followed.

Normal sandbox runs could not follow inherited pnpm links or write npm cache/
dependency directories. The same checks with ordinary filesystem permissions
passed; no dependency/API workaround was committed.

`HANDOFF_PROMPT.md` remains untracked and unchanged, SHA256
`05d2be1390a73d588ef6461df8ba583abfb86f771581009da647fca3244d5034`.
The published v0.10.0 archive, tag and release were not modified. No Host or
third-party source was changed. Publication and remote integration remain behind
the maintainer's confirmation; use the retained candidate archive.

Profile package.json, cordis.yml and pnpm-lock.yaml match the pre-install hashes.
The cordis.patch.yml hash changed during the interactive Desktop/model-selection
session (`937e4543…` → `c2fb15af…`); no claim that all profile bytes stayed unchanged
is made. The current user configuration is preserved, rather than overwritten.
The Code Index draft check above did not press Save.

The tested candidate **remains installed** in Desktop. On final cleanup the app
warned that quitting would interrupt running tasks; Computer Use canceled Quit.
No task was forcibly terminated and the original junction was not restored live.
The preserved original junction is
`<desktop-profile>/node_modules/.dsh-code-index-v0101-original`; the isolated npm
consumer remains under the candidate directory. Restore that junction only after
a normal shutdown, or replace the candidate through the ordinary plugin manager
when publication is approved. No investigation of the quit/task warning followed.
