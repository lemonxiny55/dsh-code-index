# v0.11.1 compatibility verification

**Status: PUBLISHED — 2026-10-25 (Asia/Shanghai).** The candidate reached RELEASE READY on 2026-10-24; the formal publication record below follows explicit user authorization and the successful post-merge main gate.

## Scope and workspace

Read `AGENTS.md` before the gate. Remote `refs/heads/main` was checked with `git ls-remote` and matched `bff05f9e2861332ba2ed98f1eda46968aef483a6`; the candidate branch starts there. The original branch was `codex/fix-issue-10-pnpm-workspace`. Its untracked `HANDOFF_PROMPT.md` was preserved.

The bounded gate was: normal rc.3 compatibility acceptance and plugin loading; successful execution of all eight tools; real Impact X-Ray evidence and Web interaction; Node 22/24 tests, typecheck, builds and packed installation against the two old groups and rc.3. No Host or third-party extension changes were needed.

## Actual rc.2 / rc.3 interfaces

Compared official npm `0.2.1-rc.2` and `0.2.1-rc.3` packages, rather than assuming API compatibility from version numbers. [Per-file interface hashes](assets/release-v0.11.1-interface-audit.json) record both sides.

| Used surface | Result |
| --- | --- |
| `dsh-tools`: `defineTool`, schema validation, registration, execution, output projection, `meta` and presentation | All shipped `lib` runtime files and type declarations identical; only package/dependency versions changed. |
| `dsh-system-prompt`: `section`, tool schema providers, context assembly | All shipped `lib` files identical. |
| `dsh-settings`: `configure({auto:false}, fiber)` and live form integration | All shipped `lib` files identical. |
| `dsh-client-ui-slots`, `dsh-client-locale` | All shipped `lib` files identical. |
| `dsh-client-ui-tool`: `tool.call.toolview`, phase/block/meta and `openFile` props | All shipped `lib` files identical. |
| `dsh-client-ui-sidebar-documentpreview`: file preview | All shipped `lib` files identical; actual rc.3 preview opened the selected source file. |
| `dsh-cordis-client-runner`: context/effects, slots, config forms and optional injection | All declarations and Host files identical. Only browser `client.js` differs: generated slot catalogue additions/location updates for new entry-customization menus; the plugin-used contracts are unchanged. |

The rc.3 Web bundle adds an entry-customization row. It does not require a change to this plugin's interfaces. No `src/` change is required.

The real rc.3 `evaluatePluginCompatibility` rejects the original v0.11.0 manifest, without an exemption. It accepts the candidate for exactly `0.2.0-rc.2`, `0.2.1-rc.2`, `0.2.1-rc.3`, and still rejects an unlisted `0.2.1-rc.4`. No `engines.dsh` override or `allow-version` exemption was added.

## Real rc.3 Host and Web

Installed official `@deepseek-ai/dsh@0.2.1-rc.3` into `.rc3/host`. Used a new repository-local `DSH_HOME=.rc3/home` with shipped base/Web services and only this third-party plugin. The existing Desktop profile, credentials, Host implementation and existing data were not changed. A verification overlay enables the opt-in `codeHealth` tool.

1. API preflight used actual rc.3 Cordis, Tools and SystemPrompt services. Two small distinct repositories verified session-cwd switching, no cross-repository marker leakage, external add/delete freshness, change context and repo-map injection. X-Ray used the existing six-source-file Git demo, with one real edit to `normalize`.
2. Installed the tarball with the official CLI: `dsh plugin --profile web add <local-tarball>`. Normal Host compatibility checks accepted it. Startup registered `code_index`, `code_symbols`, `code_search`, `code_map`, `code_refs`, `code_change_context`, `code_context` and `code_health`.
3. Executed those eight tools through the complete official profile's `ctx.tools.execute`; also executed `code_change_context` in both default and X-Ray modes. All nine calls returned `isError:false`. Default content stayed identical to X-Ray content. The graph had **6 call relations, 3 import relations, 1 test lead**, with exact/import-scoped/name-only provenance and actual source windows. Installed-package smoke independently checks every node/edge source window against its file.
4. Saved the actual Host outputs as DSH session events through official message constructors and persistence APIs, then terminated that process and booted a fresh normal CLI Web process. The saved session `37a15959-ef48-4ce6-81fc-f72531548285` replayed successfully.
5. Computer-operated the real Web UI in Edge: card display, node/relationship selection, actual call/declaration source, native source preview, expanded view, English/Chinese switching, confidence filter, imports, test leads, two-hop path steps, gaps/limits, and interactive cold replay all passed. This is computer-operated Web verification, not a manual test or a model-driven Agent run.

[English expanded view](assets/release-v0.11.1-rc3-xray-en.png) · [Chinese cold-process replay](assets/release-v0.11.1-rc3-cold-replay-zh.png).

## Node and installation matrix

Tests ran from a clean candidate source snapshot with an independent Git root. Original local validation directories were preserved. Frozen dependency installation used pnpm **11.28.5**, the unchanged lockfile and `--ignore-scripts` in a new consumer; both builds were executed explicitly.

| Node | Tests | Typecheck | Server/client build | Installed tools 0.2.0-rc.2 | 0.2.1-rc.2 | 0.2.1-rc.3 |
| --- | --- | --- | --- | --- | --- | --- |
| 22.23.4 | 253/253 | pass | pass | pass | pass | pass |
| 24.19.0 | 253/253 | pass | pass | pass | pass | pass |

All six install smokes used the same immutable candidate archive. Each creates a new npm consumer, installs matching first-party peers, checks package contents and all tools, then uses the selected version's real ToolRuntime. Native dispatch now also includes `code_health`. ArkTS/Rust, default text/Context Pack and X-Ray provenance/source checks remain enabled.

Reproduction commands, for each selected Node on PATH and a clean candidate checkout:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
npm pack --ignore-scripts --json
node scripts/release-smoke.mjs /absolute/path/dsh-code-index-0.11.1.tgz 0.2.0-rc.2
node scripts/release-smoke.mjs /absolute/path/dsh-code-index-0.11.1.tgz 0.2.1-rc.2
node scripts/release-smoke.mjs /absolute/path/dsh-code-index-0.11.1.tgz 0.2.1-rc.3
```

The local run invoked the same underlying Vitest, TypeScript and tsup entrypoints directly under each Node. [Machine-readable validation](assets/release-v0.11.1-validation.json) includes versions, log hashes, runtime hashes and the complete install matrix. Raw logs and the Host/API verification scripts remain under the locally excluded `.rc3/` directory.

## Locked candidate and minimal patch

- Archive: `.rc3/dsh-code-index-0.11.1.tgz`, **461,291 bytes**, **24 files**.
- SHA256: `f3c84c692965758288279d761780807aa3da67ab34c22195f4e9b834212b5846`.
- [Package manifest](assets/release-v0.11.1-package-manifest.json) records every file's SHA256. Compared with the published v0.11.0 manifest, only `package.json`, `CHANGELOG.md`, `README.md`, `README.zh.md` and `scripts/release-smoke.mjs` differ. All server/client runtime files, declarations, source maps, grammars and other scripts match v0.11.0. Node 22 and 24 runtime hashes also match each other.
- Production changes: bump to `0.11.1`; append only the exact verified rc.3 peer; make rc.3 the default smoke target and dispatch `code_health` through the native smoke. Development dependencies, runtime dependencies, Node engine range and lockfile remain unchanged. Remaining files are documentation/evidence.
- The final Host install used a SHA256-qualified tarball filename to avoid pnpm reusing the earlier same-path candidate. Its installed file hashes match the locked archive.

## Failures, compatibility observations and remaining limits

No plugin blocker or rc.3 Host defect was found. Initial sandbox runs failed before meaningful execution with filesystem `EPERM`; normal-permission runs resolved that. The default-cwd test and first smoke attempts encountered the checkout's large local scratch/history directories; the same unchanged checks passed from the clean source snapshot. No timeout or acceptance criterion was relaxed, and no data was deleted to make the gate pass.

The isolated profile-only pnpm install emitted peer warnings; the normal Host resolved its own matching first-party services and loaded the plugin, and all six independent packed consumers passed. No exemption was used and no host/plugin ecosystem investigation was needed.

Verification covers actual rc.3 Host APIs and Web UI, including cold replay. It does **not** claim a model-driven Agent round-trip or rc.3 Electron Desktop interaction. Old-group full Desktop UI was not rerun; their installed ToolRuntime matrix passed, and the prior v0.11.0 Desktop evidence remains separately documented. Existing static-analysis, source-snapshot and memory limits remain unchanged. At the candidate gate, no blocker remained; npm publication, PR merge and Release creation were still pending explicit user action. See the formal publication record below.

## Formal publication record — 2026-10-25

This section and [publication metadata](assets/release-v0.11.1-publication.json) are a documentation-only record after the release tag. The candidate validation JSON above remains the historical pre-publication gate; this record does not amend the tag or change the npm archive.

- PR [#12](https://github.com/lemonxiny55/dsh-code-index/pull/12), reviewed Head `68f872e4850a4f4090b9b82077faf5ecd22e0d2c`, was squash-merged as **`d3fb04eb3f0af9c93bc5c661064f03c30d469db0`**. The merged tree exactly matches the reviewed candidate tree.
- Post-merge [main CI run 54](https://github.com/lemonxiny55/dsh-code-index/actions/runs/40156561879) completed successfully for that exact release SHA. Node **22.23.3** and **24.21.0** both passed frozen install, typecheck, server/client builds and the rc.3 installed-package smoke. Each Linux job reported **252 passed / 1 skipped**, with all 28 test files passing. The skip is the pre-existing Windows-only cache-path casing test, already passed in the Windows local gate; no check was disabled.
- An independent clean build from the release commit reproduced the candidate archive byte for byte: **24 files, 461,291 bytes**, SHA256 **`f3c84c692965758288279d761780807aa3da67ab34c22195f4e9b834212b5846`**. Every packed file matched the committed manifest. Existing local acceptance was not repeated wholesale.
- Both `prepare` and `prepublishOnly` build scripts were inspected. Publication explicitly used the original locked tarball with `npm publish <tarball> --ignore-scripts --tag latest --access public --registry=https://registry.npmjs.org`; lifecycle scripts could not rebuild or mutate it. npm login and per-publication authentication were completed by the user in npm's official browser flow, without sharing credentials.
- Published npm package: [`dsh-code-index@0.11.1`](https://www.npmjs.com/package/dsh-code-index/v/0.11.1), **`latest=0.11.1`**. Registry publication time: **2026-10-25 03:08:24.216 UTC / 11:08:24.216 Asia/Shanghai**. The registry briefly reported processing before the version became visible; no duplicate publication was attempted.
- Downloaded the [official registry archive](https://registry.npmjs.org/dsh-code-index/-/dsh-code-index-0.11.1.tgz) and verified its 461,291 bytes, complete SHA256 above, SHA1 `ecaaa420f9210842415035d4e757409d95a81576`, SHA512 integrity and all **24** paths/per-file hashes against [the locked manifest](assets/release-v0.11.1-package-manifest.json). All matched, including server/client runtime and metadata; the package reports version `0.11.1` and retains exactly the three verified host groups.
- Annotated tag **[`v0.11.1`](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.11.1)** has tag-object SHA `80ce8fddbe8f6e2d19a1b076cedadde6a036c75c` and peels to the release commit `d3fb04eb3f0af9c93bc5c661064f03c30d469db0`.
- [GitHub Release v0.11.1](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.11.1), ID `423118654`, is published, non-draft and non-prerelease. It contains bilingual notes, the identical tarball (GitHub asset digest matches the same SHA256), and the per-file manifest.

**Remaining verification boundaries:** rc.3 Electron Desktop UI and a model-driven Agent round-trip remain **unverified**. Actual rc.3 evidence is CLI installation, Host APIs and computer-operated Web interaction/cold replay. The release does not expand the compatibility range or assert those unperformed checks. DSH Host, production source and existing user data were not changed; `HANDOFF_PROMPT.md` was neither modified nor committed. Publication is complete; no new-version development was started.
