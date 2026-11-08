# Proposed title

v0.12.0: Reliable Context & Evidence

# Proposed body

Context Packs could miss Chinese intent, treat path components as explicit symbols, and spend context budget on unrelated candidates. This release improves deterministic routing and source selection, and adds optional bounded evidence summaries so callers can distinguish static evidence, candidate tests and actual gaps.

The final gate also found and fixed an install blocker: `>=0.2.0-rc.2` alone rejected the current `0.2.2-rc.1` SDK under normal npm peer rules. Explicit declared RC groups now install without force/legacy-peer overrides. Package metadata is prepared as 0.12.0; it has not been published.

Validation:

- Earlier Node 22/24 full suites: 290/290 each; typecheck, server/DTS/client builds and six original quality replays passed.
- Earlier installed candidate: rc.3 Host 23 calls and actual Desktop 0.2.2-rc.1 22 calls; stable profile restored.
- Final round only: peer regression red 3/6, green 6/6; typecheck passed; clean normal npm installs with automatic peers and explicit SDK 0.2.2-rc.1 passed.
- Normally installed SDK/Cordis: eight tools registered, two targeted pipeline calls passed, then fully disposed.
- Two real-Agent rechecks completed with correct tool output and final answers; previous token/Host permission/transport failures remain documented rather than rewritten as passes.

No new feature scope, model API dependency or global Hook. Application source/dist are byte-identical to the tested rc.0 build in this final round. Tool APIs and budgets remain compatible; optional evidence can be omitted, static callers are not runtime proof, and test leads are not verified coverage.

Release Notes: `RELEASE_NOTES.md`, `RELEASE_NOTES.zh-CN.md`.
Decision/evidence: `RELEASE_READINESS.zh-CN.md`, `release-blockers/`.

This file is a PR draft only. No remote push, PR, tag, npm publish or GitHub Release is performed by this preparation.
