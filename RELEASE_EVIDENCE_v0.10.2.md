# v0.10.2 Release Evidence / 发布证据

Date: 2026-10-19 (Asia/Shanghai). Status: **LOCAL RC READY — unpublished / 本地 RC READY，未发布**.

Branch: `codex/rust-symbols-v0.10.2`, forked from freshly fetched `origin/main` at `db73d9c44f0903ce333eb2559d8b84c6f6d46fab`. Source revision is the commit containing this evidence; obtain its full SHA with `git log -1 --format=%H`. No remote branch/PR/CI, main push, npm publication, tag or GitHub Release was performed for v0.10.2. Community feedback has not been posted.

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

## Release boundary / 发布停止点

**LOCAL RC READY**, no known technical blocker for this candidate. Remote CI/review, merge and formal publication have not been run for v0.10.2 and remain a later authorized release gate. The known limitation is unchanged Rust call-expression coverage, not full type-use navigation.

`HANDOFF_PROMPT.md` remains untracked and untouched, SHA256 `05d2be1390a73d588ef6461df8ba583abfb86f771581009da647fca3244d5034`. Main stays at the baseline. No npm publish, tag, Release or community message. Both language notes describe the same fix and limitations. 等待用户确认后再推进远程关卡或发布；对 @dio16 的反馈与复测邀请尚未发送。
