# Changelog

All notable changes to dsh-code-index are documented here.

## 0.3.0 — unreleased

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