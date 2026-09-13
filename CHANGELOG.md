# Changelog

All notable changes to dsh-code-index are documented here.

## 0.5.0 — 2026-09-13

- **feat(refs):** new `code_refs` tool — a function-level call graph built from the cache. For any symbol it returns in-repo definitions, callers (every call site invoking it, with the enclosing function) and callees (what the definition itself calls, resolved to `file:line`). Name-based resolution, so like-named symbols surface as candidate definitions rather than being guessed apart.
- **feat(extract):** call-site extraction across all eight languages (TS/JS calls + `new`, Python `call`/`attribute`, Go `call_expression`/`selector_expression`, Rust calls + `field_expression`/`scoped_identifier`, Java `method_invocation`/`object_creation_expression`, C/C++ calls + `field_expression`/`qualified_identifier`). Each call records its enclosing function (`''` at module scope), which is what makes callers/callees precise without a second parse.
- **feat(health):** optional `code_health` tool (off by default; enable with `codeHealth: true`) — Tarjan SCC detection over the import graph reports circular dependencies, and orphan-module detection flags symbol-bearing files that neither import nor are imported, excluding entry points and tests.
- **feat(search):** call fan-in is now a tie-break in `code_search` ranking — when relevance and export status are equal, a symbol called from more places ranks first.
- **feat(ui):** `code_search` and `code_symbols` emit a search-shaped `presentationMeta` and a `search` result card, so capable clients render matches as grouped-by-file results instead of raw text.
- **feat(client):** browser half — per-tool cards for the `code_*` tools (structured search results with clickable file:line) and a `code-index` settings card in the Plugins settings page (auto-inject / code_health toggles plus repo-map size), backed by a Host settings namespace registered when a settings provider is present.
- **feat(store):** caches written before call-graph support are treated as stale (calls are compared during the equality check) instead of silently shadowing the richer fresh index.
- **test:** call-extraction coverage across all eight languages, call-graph resolution, cycle/orphan detection, and end-to-end `code_refs`/`code_health` execution.

## 0.4.0 — 2026-09-08

- **feat(extract):** C and C++ support — 11 new extensions (`.cpp .cc .cxx .c++ .hpp .hxx .hh .h .ipp .tpp .inl .c`) parse through `tree-sitter-cpp`/`tree-sitter-c` with zero new dependencies (both grammars ship in the existing `tree-sitter-wasms` pack). Symbol extraction resolves names through the declarator chain: free functions, in-class methods, out-of-class definitions (`Scene::queryRegion` → bare `queryRegion`), constructors, templates, namespaces (→ module kind), structs/unions, enums and typedefs. `public:`/`private:` section tracking (structs default public, classes private) plus `static` internal-linkage detection drive the exported flag.
- **feat(map):** `#include "…"` specifiers feed the import graph — quoted includes resolve in-repo (sibling-relative and project-root styles), `<system>` headers are dropped, and bare-path candidates match extension-carrying targets (`net/socket.hpp`).
- **feat(extract):** signatures hard-capped at 80 chars so multi-line C++ declarations (mock frameworks, template specials) cannot blow up repo-map rows or search hits.
- **fix(map):** symbol dedupe on `kind|name|line` guards double captures (e.g. a typedef aliasing a struct definition).

## 0.3.1 — 2026-09-04

- **feat(extract):** adapt to web-tree-sitter ≥ 0.25 — ESM named exports (`Language`, `Query`, `Node`) replace the 0.20.x CJS default export, the deprecated `lang.query()` gives way to the `Query` constructor, a null `parse()` result now raises instead of failing downstream, and node-child access hardens with optional chaining.
- **fix(pkg):** declare `@deepseek-ai/dsh-tools` as an optional peer dependency instead of a bundled runtime dependency (it moves to devDependencies for local typechecking), and ship the `scripts/` directory in the published package.
- **docs:** refresh the positioning copy in both READMEs and update the web-tree-sitter version note to `^0.25`.

## 0.3.0 — 2026-09-03

- **feat(map):** personalized PageRank over the import graph replaces flat in-degree counting — rank flows A→B when A imports B, so a hub that other hubs themselves import now outranks a merely popular leaf (the transitive signal +0.5-per-importer could not see). The teleport vector is each file's density share, keeping graph-less repos at their exact 0.2.x ordering; deterministic power iteration (d=0.85).
- **docs:** add a Feedback section to both READMEs — usage reports and ranking misbehaves now have an explicit entry point.

## 0.2.0 — 2026-08-28

- **feat(extract):** Go, Rust and Java support — functions/methods/types map onto the existing kind model (Go structs → class, interfaces → interface, uppercase = exported; Rust impl fns → method, `pub` = exported; Java records/interface members handled), and their imports feed reference ranking (`import` paths, `use` declarations, Java package imports).
- **feat(map):** reference-aware ranking — imports are extracted per file (ES imports/re-exports, Python imports) and each in-repo import adds 0.5 to the target's map score, so heavily-imported core files outrank symbol-dense-but-peripheral ones. Resolution handles extensions, index files, `__init__.py`, and Go/Java-style rooted paths via suffix fallback.
- **feat(search):** subsequence fuzzy matching (score 0.3, 3+ char queries) — 'cfgldr' now finds `configLoader` below exact/prefix/substring hits.
- **feat(extract):** correct Python semantics — class-body `def`s are now `method` (was `function`), and top-level defs/classes are `exported: true` since Python module-level symbols are importable; `exportedOnly` filtering now works for Python.
- **feat(config):** new `mapTtlMs` option for the auto-injected map's refresh interval (default 60 000 ms, floor 1 000 ms).
- **feat(map):** downweight test-looking paths in repo-map ranking (0.2× multiplier for `tests/`, `__tests__/`, `*.spec.*`, `*.test.*`, `test_*.py`, `*_test.py/go`) — symbol density actively favoured test files, so maps led with them.
- **fix(extract):** collapse multi-line parameter lists in signatures to one line; they wrapped the repo-map format and burned its char budget.
- **fix(extract):** index only module-level variables. The `variable_declarator` query matches at any depth, so function-body locals leaked in as noise — on one mid-size repo, 36% of all indexed symbols were locals.
- **fix(extract):** `exported` no longer leaks through class bodies: methods inside an `export class` (including `private` ones) were marked `exported: true` because the ancestor walk reached the enclosing `export_statement`. Only module-level declarations count now.
- **fix(store):** self-heal empty `symbol.file` fields from legacy caches on load, so the "file is always set" invariant holds at the persistence boundary.
- **feat:** index Python sources (functions + classes) alongside TS/JS.
- **chore(pkg):** add Node engines, repository/homepage metadata, npm + CI badges.
- **ci:** GitHub Actions workflow (typecheck + test + build) on push/PR.
- **test:** end-to-end tool-execute coverage (fixture repo → session cwd → query) and cache self-heal tests.

## 0.1.0 — 2026-08-21

- Initial release.
- Tools: `code_index`, `code_symbols`, `code_search`, `code_map`.
- Tree-sitter symbol index for TypeScript + JavaScript (WASM, no native build).
- Incremental mtime cache under `<repo>/.dsh-code-index/`.
- Optional bounded system-prompt repo-map injection (60s TTL, `autoInject` toggle).
- Config: `excludeDirs`, `mapTopFiles`, `mapMaxChars`.