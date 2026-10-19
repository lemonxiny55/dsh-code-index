# v0.10.2 Release Evidence / 发布证据

Date: 2026-10-19 (Asia/Shanghai). Status: **PUBLISHED — npm latest 0.10.2 / 已正式发布**.

Implementation branch: `codex/rust-symbols-v0.10.2`, based on `db73d9c44f0903ce333eb2559d8b84c6f6d46fab`. [PR #6](https://github.com/lemonxiny55/dsh-code-index/pull/6), head `b39faebcb046430ae3815c3e461d581e8365fdca`, was merged as release commit [`2d65cbc675722a0d956071429384cd076e6947e4`](https://github.com/lemonxiny55/dsh-code-index/commit/2d65cbc675722a0d956071429384cd076e6947e4). The merged tree equals the verified PR head. Publication evidence and release-note status are updated afterward in a separate documentation-only commit; that later commit is not the published source revision, and the release tag stays on `2d65cbc675722a0d956071429384cd076e6947e4`.

## Formal publication / 正式发布

| Record | Verified result |
| --- | --- |
| PR CI | [Run 39210619257](https://github.com/lemonxiny55/dsh-code-index/actions/runs/39210619257); Node 22/24 successful; each 241 passed, 1 expected Windows-only skip, 0 failed |
| Main CI, attempt 1 | [Original run](https://github.com/lemonxiny55/dsh-code-index/actions/runs/39242685667/attempts/1); Node 22 successful; Node 24 failed: 239 passed, 1 skipped, 2 timeouts; publication stopped |
| Main CI, attempt 2 | [Successful workflow](https://github.com/lemonxiny55/dsh-code-index/actions/runs/39242685667/attempts/2); exact release SHA above; only failed Node 24 job rerun; Node 22 success carried forward |
| Node 24 retry | [Job 118030961660](https://github.com/lemonxiny55/dsh-code-index/actions/runs/39242685667/job/118030961660); 43 seconds; 26 test files, 241 passed, 1 expected skipped, 0 failed; frozen install, typecheck, build and installed-package smoke all successful |
| npm | [dsh-code-index@0.10.2](https://www.npmjs.com/package/dsh-code-index/v/0.10.2); registry `latest = 0.10.2`; publication timestamp `2026-10-19T11:35:13.129Z` (19:35:13 Asia/Shanghai) |
| Download | [Actual npm tarball](https://registry.npmjs.org/dsh-code-index/-/dsh-code-index-0.10.2.tgz); 415815 bytes; 19 files; complete SHA256 and every file hash match the frozen candidate |
| Tag | [v0.10.2](https://github.com/lemonxiny55/dsh-code-index/tree/v0.10.2), annotated object `7d180bc7277d316407d131b80b44694bdde4772c`, peeled commit `2d65cbc675722a0d956071429384cd076e6947e4` |
| GitHub Release | [v0.10.2](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.10.2); stable, published `2026-10-19T11:38:38Z`; bilingual notes, original tarball and SHA256SUMS attached |

The initial Node 24 failures were 5000ms timeouts in `tests/arkts.spec.ts:65` (pinned official samples) and `tests/tools-execute.spec.ts:95` (null-cwd resolution). The successful Node 22 job kept its original 11:10:18–11:11:09 UTC execution times. Only Node 24 was rerun, at 11:20:06–11:20:49 UTC. Neither timeout reproduced; source, test thresholds, dependencies and workflow were unchanged. No root cause or test-stability fix is claimed.

Verification method: GitHub Actions API job/step results, original failed-job and successful retry logs, Git tree comparison, an actual local build of the exact merged main commit, archive/file hashing, npm publication and independent registry HTTP download. No new Desktop manual test was performed during publication; the earlier actual Desktop evidence below remains the candidate validation.

The fresh main build was packed separately with `npm pack --ignore-scripts` and compared to the retained candidate before publication. Both archives and the subsequently downloaded npm archive have SHA256 `22a79bd1c36fe8449264f2dcddadbe9e1fa04a088228c12a4f2916e7d308eeae`. All 19 inventory paths, byte lengths and SHA256 values match, including peerDependencies, server/client bundles, declarations, source maps, ArkTS WASM and licenses. The candidate was never replaced. npm SHA1 is `23480a799d1638be7181cde32411b9c4bde364f8`; integrity is `sha512-sY+52u4GrXWuQm0TsiMDaXYdle+80407bgpCSOKE2zfixgZcfYXKiL3uLOH3t6WKmLFAlCDGEQOWVROLhoF7nA==`.

Published the original frozen tarball with `npm publish .dsh-code-index/release-v0102/dsh-code-index-0.10.2.tgz --ignore-scripts --access public --tag latest --registry=https://registry.npmjs.org`. Local npm implementation and dry-run confirmed tarball upload with lifecycle scripts disabled, preventing `prepublishOnly`/prepare from rebuilding publication contents. The user completed browser authorization; no plaintext credentials were requested. npm initially returned success with an asynchronous-processing notice; registry verification waited until the version and latest tag became visible before proceeding. GitHub's uploaded tarball digest independently matches the same SHA256.

## Observable gate / 最小验收

The reported Rust declarations display their declared names; old cached extraction rebuilds; `code_symbols`, `code_search`, `code_map`, `code_context` and `code_refs` agree. Existing function calls remain traceable, without adding unsupported type-use edges. Existing nine-language Node 22/24 regression, builds and installed-package smoke pass. Actual Desktop verification uses the same candidate.

验收限于 Rust 声明名称展示、旧缓存重建、五个相关工具结果一致，以及既有九语言回归和真实 Desktop 最小复现；不增加 v0.11 功能、ArkTS 语义、UI、向量检索或性能架构。

## Root cause and bounded fix / 根因与修复范围

Read [Issue #5](https://github.com/lemonxiny55/dsh-code-index/issues/5), AGENTS.md, extraction/ID/cache implementations and existing tests. Executed the repository's actual packaged Rust WASM with `web-tree-sitter`, plus the unchanged v0.10.1 bundle, against `tests/fixtures/rust/repro.rs`.

- AST `name` fields are `PublicOne`, `PublicEnum`, `PublicTrait`; the first named child is `visibility_modifier`, text `pub`.
- `nameOf()` already reads the correct field. Captures, `SymbolInfo.name`, stable qualified IDs, scopes, search matching and exported flags were correct before the fix.
- `rawSignature()` fell back to `namedChildren[0]` for types without parameters. This stored `signature: "pub"` (or restricted visibility text) in schema-3 caches. Search/definition/map/context metadata renderers prefer `signature || name`, masking the correct identity. Source excerpts themselves remain actual source.
- Existing function items resolve a parameter list first, explaining why their signatures were unaffected.
- Fix only the Rust struct/enum/trait signature branch, using the same declared name. No query, capture, name extraction, ID algorithm or graph resolution change.
- Advance extraction/cache generation 3 → 4, using existing disk rejection/rebuild; also reject incompatible `previous` data passed directly to public `buildIndex`. All older caches rebuild once, even when file mtime is unchanged. No in-place guessing of old graph identities.

实际根因为签名生成，不是 Issue 作者推测的名称提取回退。修复前真实符号名称和 ID 已正确；被优先展示的签名误取了 `pub`。本次只调整 Rust 类型签名及必要的缓存失效处理，未修改宿主或第三方插件。

`exported` boolean and generic `export` display marker are unchanged. They denote normalized public status, not a Rust keyword: unrestricted `pub` is true; private, `pub(crate)` and `pub(in path)` declarations are false. Existing struct → class and trait → interface mappings remain. No tool schema/return contract or client wording changed. Bilingual READMEs and release notes explain the semantics.

## Regression / 回归

[Machine-readable AST/before-after/test evidence](assets/rust-v0.10.2-regression.json).

| Check | Result |
| --- | --- |
| New Rust tests on unmodified baseline | 1 passed, 6 failed; failures include `pub` / restricted signatures and old-cache acceptance |
| Same Rust tests after fix | 7/7 passed |
| Node 22.23.3, Windows | Typecheck passed; 26 test files, 242 passed, 0 failed/skipped; server/declarations/client builds passed |
| Node 24.19.0, Windows | Typecheck passed; 26 test files, 242 passed, 0 failed/skipped; server/declarations/client builds passed |
| Nine existing languages | ArkTS, TypeScript, JavaScript, Python, Go, Rust, Java, C++, C regression retained |
| Visibility matrix | Ordinary / `pub` / `pub(crate)` / `pub(in crate::nested)` × struct (named/tuple/unit), enum, trait and functions; trait method signatures retained |
| IDs | Minimal repro IDs equal baseline before/after; line/comment-only edits retain IDs |
| Tool paths | Symbols, exact search, rendered hits, map, default context, explicit pack, type and function refs verified |
| Cache upgrade | Actual backed-up v0.10.1 bundle wrote schema-3 cache, then v0.10.2 rebuilt schema-4 with identical source mtimes and correct IDs; disk and direct incremental build passed |
| Defensive cache regression | Seeded old-generation wrong name/signature/ID data is discarded and reconstructed from source |

Tests include type annotations and a struct literal. They do not become call edges. The real `public_function(1)` call still produces one caller. The synthetic indexing fixtures are not a Cargo compilation or Rust semantic-analysis claim.

## Candidate and installation / 候选包与安装

Candidate: `.dsh-code-index/release-v0102/dsh-code-index-0.10.2.tgz` (ignored local artifact).

- Version `0.10.2`; **19 files**, **415815 bytes**, unpacked **3150476 bytes**.
- SHA256: `22a79bd1c36fe8449264f2dcddadbe9e1fa04a088228c12a4f2916e7d308eeae`.
- SHA1: `23480a799d1638be7181cde32411b9c4bde364f8`.
- Manifest: `@deepseek-ai/dsh-tools: 0.2.0-rc.2 || 0.2.1-rc.2`, unchanged; no wider host support claim.
- Independently built Node 22 and Node 24 archives are byte-identical. All 19 installed Desktop files match the frozen archive.
- Seven client/grammar/license/bundle files match the v0.10.1 published inventory. ArkTS WASM SHA256 remains `a5fbf24b2eeab43cf60e9fcdbde99e9089f7ceae43134d24e1d5cc166d285446`; licenses, grammar provenance and client bundle remain intact. Dependency lockfile and CI workflow unchanged.

[Complete candidate inventory and hashes](assets/package-v0.10.2-preflight.json).

| Installed immutable candidate | DSH tools 0.2.0-rc.2 | DSH tools 0.2.1-rc.2 |
| --- | --- | --- |
| Node 22.23.3 | PASS | PASS |
| Node 24.19.0 | PASS | PASS |

Each smoke installs the actual tarball in an isolated npm consumer. Existing tool registration, full/compact surfaces, Context Pack, gitignore whitelist, freshness and ArkTS checks pass. Added Rust checks run through the selected real Cordis ToolRuntime schema/dispatch/render pipeline: all five target tools, normal/public/restricted type signatures, text/pack context and unchanged function-call edges. No old Desktop binary UI check is claimed.

Reproduction commands (prepend the chosen Node directory to PATH so npm child processes use the same Node):

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
node node_modules/tsup/dist/cli-default.js
node node_modules/tsup/dist/cli-default.js --config tsup.client.config.ts
npm pack --ignore-scripts --json --pack-destination .dsh-code-index/release-v0102
node scripts/release-smoke.mjs .dsh-code-index/release-v0102/dsh-code-index-0.10.2.tgz 0.2.0-rc.2
node scripts/release-smoke.mjs .dsh-code-index/release-v0102/dsh-code-index-0.10.2.tgz 0.2.1-rc.2
```

## Actual Desktop / 真实 Desktop

[Filtered calls, results, fixture source and source-range audit](assets/desktop-v0.10.2-tool-evidence.json).

- Actual DSH Desktop **0.2.1-rc.2**, existing `desktop` profile. Desktop was stopped before replacing only the target plugin with unpacked candidate files, retaining the existing dependency junction. No profile configuration or other extension edits.
- Computer Use observed plugin details: **v0.10.2**, **1 component running**. Model-backed GLM-5.3-Flash turn in session `session-0bc06b87-0f47-4e91-ba63-d4cf83dc9f72` completed normally.
- **10 calls / 10 successful results:** index, symbols, three exact searches, map, default context, explicit-pack context, type refs and function refs. Each call explicitly targets the two-file Rust fixture (2 files / 15 symbols), not the user's other repositories.
- Public type labels correct; restricted types lack the generic export marker and persisted index flags are false. `PublicOne` callers 0; `public_function` callers 1, at `use.rs:4 in caller`.
- Text and explicit-pack requests each rendered **1590 / 5000** characters. **18 source ranges** independently matched exact fixture lines. Persisted Desktop events record rendered content; raw pack DTO correctness is separately verified by installed actual ToolRuntime smoke.
- Profile `package.json`, `cordis.yml`, `cordis.patch.yml`, `pnpm-lock.yaml` hashes unchanged. No host/third-party error or isolation investigation was needed.
- Candidate remains installed and running for optional retest. Original v0.10.1 package directory is preserved as `%USERPROFILE%\.dsh\profiles\desktop\node_modules\.dsh-code-index-v0102-original`. To restore it later, first quit Desktop normally, move the candidate directory aside and rename the backup to `dsh-code-index`; do not swap live package files. Older pre-existing backups remain untouched.

真实 Desktop 最小验收通过，无宿主或第三方 blocker。候选仍安装供复测，原版本已备份；未修改 profile 配置，未展开无关调查。

## Release boundary / 发布边界

**PUBLISHED**, with main CI, npm download integrity, tag and GitHub Release verified. The known limitation remains unchanged Rust call-expression coverage, not full type-use navigation. No production implementation, host compatibility, ArkTS feature, global timeout, DSH Host or third-party extension was changed during release.

`HANDOFF_PROMPT.md` remains untracked and untouched, SHA256 `05d2be1390a73d588ef6461df8ba583abfb86f771581009da647fca3244d5034`; it is excluded from the documentation commit. Both language notes describe the same fix and limitations. Issue #5 feedback and completion are recorded after verifying npm and GitHub Release below.

## Community follow-up / 用户反馈闭环

After npm and GitHub Release were verified, posted the [English reply to @dio16](https://github.com/lemonxiny55/dsh-code-index/issues/5#issuecomment-6266353401) at `2026-10-19T11:40:31Z`. It thanks him for the real-project report and full reproduction, links the official npm package and GitHub Release, explains the Rust public struct/enum/trait signature fix, correct declaration names/stable IDs/source lines, preserved cross-language `exported` semantics, and unchanged type-use/call-edge coverage, and invites a retest on the original Rust Monorepo.

After the reply succeeded, [Issue #5](https://github.com/lemonxiny55/dsh-code-index/issues/5) was closed at `2026-10-19T11:40:45Z` with `state_reason = completed`. API readback confirms `state = closed` and `locked = false`; the reply explicitly invites further results and reopening if the display bug persists.
