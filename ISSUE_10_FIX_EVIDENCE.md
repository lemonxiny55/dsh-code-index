# Issue #10 — pnpm 9 Git installation fix

**FIX REVIEW — Draft PR only.** No version bump, npm publication, Issue closure or main merge.

## Report and scope

[Issue #10](https://github.com/lemonxiny55/dsh-code-index/issues/10), opened by
`deyyangyang-bit` at 2026-10-22 15:52:09 UTC (23:52:09 Asia/Shanghai), reports
macOS Apple Silicon, DSH bundled pnpm **11.28.5**, PATH pnpm **9.15.0**, and
main commit `72be3146247d7e9c7f9df2847eb55b1ab0d992c5` (package v0.11.0).
There were no issue comments when checked.

The repository's workspace file had `allowBuilds` and
`minimumReleaseAgeExclude`, but no `packages`. Its existing `prepare` is
`tsup && tsup --config tsup.client.config.ts`. Inspection of the installed
pnpm 11.28.5 implementation (`runPrepareScripts`) confirms that Git preparation
creates a `pnpm-install` lifecycle command containing `pnpm install`.
Our real Git installation below confirms that this command resolves pnpm via PATH.

The smallest gate is: reproduce pnpm 9's missing-packages failure, add only the
root package declaration, pass installation/build under pnpm 9 and relevant 11
versions, and verify generated Git-package artifacts load and execute. Existing
Node 22/24 tests and installation smoke remain the regression gate.

The only functional change is:

```yaml
packages:
  - '.'
```

Existing `allowBuilds` and all other workspace settings are byte-for-byte
preserved after this prefix. No prepare refactor, packageManager pin,
dependency change, runtime change or Host/third-party modification.

## Reproduction and local verification

Performed 2026-10-23 on **Windows x64 / PowerShell 7.6**, using downloaded,
version-specific pnpm distributions. This is an independent reproduction of
the reported package-manager behavior, not a macOS or Desktop UI test.
Source copies, stores, npm cache and tools were isolated under ignored `.issue10/`.

Base: `72be3146247d7e9c7f9df2847eb55b1ab0d992c5` (freshly fetched origin/main).
Fix tested from GitHub: `0fcd590bd9f618b6afa598870b05b50b9f297c9e`.

Actual pnpm 9 baseline command, from the repository root:

```powershell
node .issue10/tools/pnpm9/node_modules/pnpm/bin/pnpm.cjs --dir .issue10/before install --lockfile=false
```

```text
ERROR packages field missing or empty
For help, run: pnpm help install
exit: 1
```

The matching fixed copy (`after9`) used the same command, plus a fixture-local
`--store-dir`; exit **0**, including prepare. An explicit `build` also exited **0**.
`--lockfile=false` reproduces the reporter's command and may resolve newer
versions in that disposable copy; it does not update the repository lockfile.
The pnpm 11 and Node regression checks below use the existing frozen lockfile.

| Node | pnpm | Source | Install | Explicit build |
| --- | --- | --- | --- | --- |
| 24.19.0 | 9.15.0 | base | exit 1: missing packages | not run |
| 24.19.0 | 9.15.0 | fixed | exit 0; prepare passed | exit 0 |
| 24.19.0 | 11.28.5 | base | exit 0; prepare passed | prepare builds both outputs |
| 24.19.0 | 11.28.5 | fixed | exit 0; prepare passed | exit 0 |
| 24.19.0 | 11.28.8 | fixed | exit 0; prepare passed | exit 0 |

11.28.5 matches the reported Host version; 11.28.8 was the latest 11.x
returned by the npm registry when checked. No acceptance claim is made for
other pnpm major versions.

## Actual Git dependency and security boundary

Three fresh consumers downloaded the real GitHub dependency with outer pnpm
11.28.5, Node 24.19.0, and a PATH shim invoking the downloaded pnpm 9.15.0 CLI.
Consumer peer dependency: `@deepseek-ai/dsh-tools@0.2.0-rc.2`.

1. Base SHA, no Git build authorization: exit **1**,
   `ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED`. This is expected installation security.
2. Base SHA, explicitly authorized: exit **1**,
   `pnpm-install$ pnpm install` → `packages field missing or empty` →
   `ERR_PNPM_PREPARE_PACKAGE`. This is the plugin configuration defect.
3. Fixed SHA, explicitly authorized: exit **0**. Nested pnpm 9 installation
   completed prepare and generated `dist/index.js`, `dist/index.d.ts`, and
   `dist/client.js`; outer pnpm completed in 25.9 seconds.

Authorization was **only** the exact tested codeload URL and `esbuild`, using
the format pnpm itself requested. Bare `dsh-code-index: true` was insufficient
for pnpm 11.28.5's Git resolution, so the test used the exact resolution key:

```yaml
packages:
  - '.'
allowBuilds:
  'dsh-code-index@https://codeload.github.com/lemonxiny55/dsh-code-index/tar.gz/0fcd590bd9f618b6afa598870b05b50b9f297c9e': true
  esbuild: true
```

The fixed consumer manifest used
`github:lemonxiny55/dsh-code-index#0fcd590bd9f618b6afa598870b05b50b9f297c9e`.
Installation command (PATH prefixed by the pnpm 9 shim):

```powershell
node .issue10/tools/pnpm11/node_modules/pnpm/bin/pnpm.cjs --dir .issue10/git-after install --store-dir D:/ChatGPTProjects/dsh-code-index/.issue10/git-store-after
node assets/issue-10/git-smoke.mjs .issue10/git-after
```

The committed [CLI probe](assets/issue-10/git-smoke.mjs) loaded the installed
package, checked all three dist entrypoints, and called `plugin.apply` with a
small registration context (8 tools). It then executed through the **real**
DSH ToolRuntime: two tiny repositories with distinct markers, switching
isolation, external file add/delete freshness, and change context all passed.
The registration context is a stub; dispatch is the installed real ToolRuntime.
This is CLI/Host API evidence, not manual DSH Web/Desktop testing.

No `dangerouslyAllowAllBuilds`, broad approval, `ignore-scripts`, or disabled
security gate was used to make Git preparation succeed. npm packing uses
`--ignore-scripts`, and the existing release smoke uses it for already-built
tarballs; those are separate artifact checks and are not Git prepare evidence.

Full before/after Git output and plugin-load output are in the
[installation transcript](assets/issue-10/install-transcript.txt).

## Node regression and npm path

Both Node versions used pnpm 11.28.5 and the original frozen lockfile:

```text
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
npm pack --ignore-scripts --json
node scripts/release-smoke.mjs <candidate.tgz> 0.2.0-rc.2
node scripts/release-smoke.mjs <candidate.tgz> 0.2.1-rc.2
```

| Node | Tests | Typecheck | Build | Installed smoke: both RC groups |
| --- | --- | --- | --- | --- |
| 22.23.4 | 28 files, **253 passed**, 0 failed | exit 0 | exit 0 | exit 0 / exit 0 |
| 24.19.0 | 28 files, **253 passed**, 0 failed | exit 0 | exit 0 | exit 0 / exit 0 |

Existing smoke covers installed plugin registration, normal/compact surfaces,
index/search/map/refs/context, whitelist behavior, freshness, ArkTS, Rust,
native ToolRuntime dispatch and Impact X-Ray provenance/source evidence.

The first archive-based test run had 252/253 passing on each Node: the null-cwd
test timed out while finding the parent repository containing the whole
installation fixture tree. One base-main isolation check reproduced the same
timeout. Giving each source copy its own Git root (`git init`) bounded that
test to its actual source tree; both complete suites then passed unchanged.
No timeout override or product/test edit was made. Initial sandbox EPERM
errors on pnpm realpath were execution-environment restrictions; the actual
package-manager checks above ran with the required filesystem access.

We also downloaded the **published npm v0.11.0** tarball using `npm pack
dsh-code-index@0.11.0 --ignore-scripts`, then ran the existing release smoke
against it on Node 24.19.0 / dsh-tools 0.2.1-rc.2: exit **0**.
Its registry shasum is `b95dbce9d7154d02c3d18476f32d07a375dc8314`.

## Change and artifact audit

- Lockfile, package.json, dependencies, version, prepare, source/runtime files:
  unchanged. Frozen installations retained the original lockfile SHA-256
  `ca40ce21cf68bf039b563b1db6cdacb17b9e90af036ba2a852ee1823e8b38d9c`.
- Base and fixed npm packs, built with the same locked dependencies: **24 files,
  zero content differences; tarballs byte-identical**, SHA-256
  `9a12f8be13d1416c31caaa420e1b065fa3aef964a4af8855388af0b6c8a9826f`.
  Node 22 and 24 packs also match. The workspace file and new evidence assets
  are excluded by the existing npm `files` allowlist.
- This local candidate is not claimed byte-identical to the historical npm
  release; both the local before/after equality and the published-package
  smoke are reported separately.
- `HANDOFF_PROMPT.md` remains untracked and unchanged, SHA-256
  `05d2be1390a73d588ef6461df8ba583abfb86f771581009da647fca3244d5034`.
- [Structured validation](assets/issue-10/validation.json) records the commands'
  results, local log hashes and per-file package hashes. Full local logs remain
  in ignored `.issue10/logs/`; the decisive installation transcript is committed.

Issue #10 is recorded in the [seven-day observation ledger](PROMOTION_v0.11.0.md)
and [tracking CSV](assets/promotion-v0.11.0-tracking.csv) as **one external
installation-failure reporter**. Its acquisition channel and relationship to
promotion are unknown. It is not an npm-install failure report, a confirmed
successful user installation, or evidence of promotion-driven conversion.

Stop at **FIX REVIEW**. The reporter has not yet confirmed the fix on macOS/DSH.
