# v0.11.0 release evidence

## Candidate verification

The release candidate was built and packed from the PR #7 development branch after changing the package version from `0.11.0-dev.1` to `0.11.0`. The existing pnpm 11 lockfile passed `pnpm install --frozen-lockfile`; runtime dependencies, optional peers, Node engine range and lockfile were unchanged.

- Node 22.23.3: **253 tests passed**, typecheck and server/client builds passed.
- Node 24.19.0: **253 tests passed**, typecheck and server/client builds passed.
- Fixed packed archive: **460,993 bytes**, SHA256 `b8eb24a76dcb367c7c710ef2fd79da1644f1f6b57f132bd76ac8f2e5a7f22af0`.
- All four packed-install ToolRuntime combinations passed: Node 22/24 × dsh-tools 0.2.0-rc.2 / 0.2.1-rc.2. The smoke exercises default tool output, X-Ray relationships and source windows.
- Compared with the verified `0.11.0-dev.1` archive (`c61bd83b2be942a14eabdd911a35cb6d387aaaf9b56b1e27f81ce231473b8fdd`), the formal archive contains the same 24 files. Only `package.json`, `CHANGELOG.md`, `README.md` and `README.zh.md` differ. `dist`, grammars, scripts, license and `cordis.patch.yml` hashes match.
- `package.json` declares `prepare` and `prepublishOnly` builds. The candidate was explicitly built under both Node versions, packed with `npm pack --ignore-scripts`, and smoke-tested from that exact tarball. Publication uses the locked tarball with scripts disabled so no lifecycle build can change its contents.

The full 24-file SHA256 manifest is in [assets/release-v0.11.0-package-manifest.json](assets/release-v0.11.0-package-manifest.json); machine-readable tests, runtime hashes and compatibility data are in [assets/release-v0.11.0-validation.json](assets/release-v0.11.0-validation.json).

## Desktop and demo evidence

- Full Impact X-Ray UI interaction was manually verified in DSH Desktop **0.2.1-rc.2**: actual card and saved-result replay, node/relationship selection, English and Simplified Chinese UI, native source preview and invalid-path text fallback. This is a manual Desktop verification, not an automated UI test.
- DSH Desktop **0.2.0-rc.2** passed package installation and ToolRuntime checks. Its complete Impact X-Ray UI was not validated. The declared peer range remains `0.2.0-rc.2 || 0.2.1-rc.2`.
- The 30-second [MP4](assets/impact-xray-mvp.mp4) and [GIF](assets/impact-xray-mvp.gif) are real continuous Desktop footage from the `0.11.0-dev.0` MVP. The opening 10 seconds show a changed function, caller/test lanes and an exact relationship with source evidence. The `dev.1` first-screen improvements are shown in separate [real Desktop screenshots](assets/impact-xray-rc-zh-overview.png) and the other evidence linked from [IMPACT_XRAY_RC.md](IMPACT_XRAY_RC.md).

## Performance observations and scope

On Windows x64 with Node 24.19.0 and Ryzen 9 7940HX, 36 isolated processes compared the baseline analysis, candidate analysis and candidate X-Ray projection across the six-file fixture and the real Express 5.1.0 sample. These are observations from this machine and workload, not guarantees.

- Six-file fixture (6 TypeScript files, 11 symbols, 760 source bytes): indexing took about 175–214 ms. X-Ray projection took 3.28–7.68 ms. The cumulative process peak was about 1.29 GiB before analysis or projection in all compared modes; current RSS then settled near 62–63 MiB. This indicates the observed peak belongs to the existing index/runtime stage; it does not isolate allocator causality or imply zero X-Ray allocation.
- Express sample (142 files, 586 symbols, 559,459 source bytes): cold X-Ray index took 1.293–1.306 s, analysis 3.52–10.66 ms, projection 3.09–5.73 ms and settled-control cumulative peak 614–615 MiB. The selected `lib/utils.js` was not represented as an actual Git edit.
- Existing index/parser memory is substantial. Presentation bounds limit the projected graph and source excerpts; they do not bound cold-index memory. Static resolution, dynamic dispatch, candidate-test certainty and historical source availability retain the limits described in the bilingual release notes.

## Formal publication record

The candidate package was locked before merge as described above. This publication record is a separate documentation-only commit after release; it does not change the tagged source tree or npm archive.

- PR [#7](https://github.com/lemonxiny55/dsh-code-index/pull/7) was squash-merged as **`8c89e794c2d9e5b104d7ff72753bc52da9eba81b`**. The main tree matches the reviewed candidate tree.
- Post-merge [main CI run 45](https://github.com/lemonxiny55/dsh-code-index/actions/runs/39602401737) completed successfully on Node 22 and Node 24.
- Published package: [`dsh-code-index@0.11.0`](https://www.npmjs.com/package/dsh-code-index), registry `latest=0.11.0`.
- Registry archive: [dsh-code-index-0.11.0.tgz](https://registry.npmjs.org/dsh-code-index/-/dsh-code-index-0.11.0.tgz), **460,993 bytes**, SHA256 `b8eb24a76dcb367c7c710ef2fd79da1644f1f6b57f132bd76ac8f2e5a7f22af0`, SHA1 `b95dbce9d7154d02c3d18476f32d07a375dc8314`, SHA512 integrity `sha512-3q9UI/Nfo0AOr142E0ZbgNUIcCn4wntsDIZmtxm3uMnOOlSjaRx4Fe/vGZbyNEBCzQqhJpFOchFNZfmOr7FqNQ==`.
- The registry archive was downloaded and checked against all **24** entries in the committed per-file SHA256 manifest. Every path and hash matched; the server/client runtime hashes match the locked candidate. `package.json` reports version `0.11.0`.
- Annotated Git tag [`v0.11.0`](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.11.0) points to the verified merge commit above. The [GitHub Release](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.11.0) includes these bilingual release notes.
- This post-publication evidence commit is documentation-only and follows the release tag; its commit SHA is recorded in the delivery report. It does not amend the tag or modify files included in the npm package.
