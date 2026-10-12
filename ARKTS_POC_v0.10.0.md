# ArkTS PoC — 2026-10-12

Decision: use **harmony-contrib/tree-sitter-arkts 0.3.0**, pinned to registry
gitHead `9a97c1e6ac93bc07732c15050a0e560bc63c8d78`. PoC passed; implementation
may proceed. This document records observations, not upstream accuracy claims.

| Candidate | Inspected source | Observed suitability |
| --- | --- | --- |
| [harmony-contrib](https://github.com/harmony-contrib/tree-sitter-arkts) | 0.3.0, commit above, 2026-09-14 | TypeScript-derived AST; struct/body, decorators, ArkUI blocks, import/export, leading-dot styles. Published npm archive contains ABI-14 WASM and full MIT notices. Actual loading/finite corpus tests passed. |
| [Million-mo](https://github.com/Million-mo/tree-sitter-arkts) | 0.1.9, `2fd0ad75e2d848709edcf4be038f27b178114ef6`, 2025-10-27 | Different component/UI AST; manifest says MIT but no LICENSE file was found in this checkout. No checked-in WASM; advertised `tree-sitter-arkts-open` npm URL returned 404. README's claimed production success rate was not independently reproduced. Not selected; no native/WASM runtime pass claimed. |

The published `tree-sitter-arkts@0.3.0` manifest has a native `node-gyp-build`
install hook and native dependencies. Adding it directly would complicate this
plugin's pure-WASM install. Instead vendor the **unchanged** published WASM and
license; package consumers do not need the upstream Node addon. Full archive
integrity, binary hash, source pin and upstream build method are recorded in
[grammars/README.md](grammars/README.md). Registry `gitHead` matches the inspected
checkout. The archive's SHA512 was independently verified during preparation.

Actual PoC used this repository's `web-tree-sitter@0.25.10`, `Parser.init`,
`Language.load(bytes)`, `setLanguage`, and `parse` on Windows Node **22.23.3**
and **24.19.0**. Grammar ABI **14** loaded on both without Node native addons.
Official Node ZIP SHA256 values were checked against `nodejs.org` manifests.

The finite official corpus is [tests/fixtures/arkts/official](tests/fixtures/arkts/official):

- All seven ETS/TS sources of the small OpenHarmony Browser sample, pinned to
  `508cda899cc6a6df9c0c6fb6aecec3c275337606`. Four ETS files cover V1 structs,
  State/Link, nested Flex/Column/Row/List/ForEach and application logic; three
  TS files cover lifecycle and logger helpers.
- All 15 TypeScript-fenced snippets of the official `@Local` document pinned to
  OpenHarmony docs `f41b9345badd47c7ab0c263344cd7f4b5a549afb`. Includes V2,
  Local/Param/ObservedV2/Trace and V1/V2 comparisons; two snippets are explanatory
  fragments rather than runnable applications. No syntax repair or success-only
  filtering was used. Source URLs/hashes/line counts are retained.
- Result on both versions: **22 inputs; 0 ERROR; 0 MISSING**. This is a finite
  parser acceptance check, not a HarmonyOS compiler check or accuracy percentage.
- Focused synthetic regressions additionally verify Builder/global functions,
  imports/exports, styles, malformed input, identity/ranges and false relations.

ArkTS extraction has independent queries over the actual struct and UI nodes.
Component structs use the existing `class` identity vocabulary. Method decorators
are siblings in this grammar; field/struct decorators are children or belong to
the export wrapper, so extraction must explicitly include their source lines.

Boundaries: no SDK/type checker, package/HAR/oh-package alias resolver, re-export
chain certainty, state-update/rerender graph, or HarmonyOS runtime execution.
Ambiguous ETS/TS stems stay unresolved; explicit extensions remain usable.
Default import targets retain import-scoped provenance. UI calls without
local/explicit bindings never receive repository-wide guessed component targets.
Parsing may accept some invalid ArkTS, since this is a syntax grammar.
