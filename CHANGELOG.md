# Changelog

All notable changes to dsh-code-index are documented here.

## 0.1.1 — unreleased

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