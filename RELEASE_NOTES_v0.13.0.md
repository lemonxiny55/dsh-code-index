# dsh-code-index v0.13.0

**Review Brief — Review potential code-change impact before AI edits.**

This release adds an opt-in Review Brief to `code_change_context`. Set `outputFormat: "review"` to inspect bounded changed-symbol source, static relations, candidate tests, repository observations and evidence gaps. Default text, X-Ray and original Context Packs remain available. See [the reproducible tutorial](docs/development/v0.13.0/DEMO.en.md).

The full JSON output defaults to 5000 JavaScript characters (300–20000); this is not a token limit and excludes host overhead. Tests are not run and coverage is not verified. Static relationships are not proof of runtime impact, omissions are not evidence of absence, and repository metadata is a non-atomic observation. Select symbols with exact IDs from `code_symbols`, or omit them for the working tree diff.

DSH Desktop 0.2.2-rc.3 validation and Agent limitations are recorded in [M2 acceptance](docs/development/v0.13.0/M2_ACCEPTANCE.zh-CN.md). The six Desktop images are explicitly [Host API replays](docs/assets/v0.13.0/README.md), not model-success screenshots. The first B Agent attempt reached its 4096-token limit; the 8192-token retry completed. Completed Agent tasks still included documented reasoning errors.

Automatic AgentTeam handoff, full before/after diff, caller and test source bodies, a dedicated Review Brief card and major ArkTS parsing expansion are deferred. This is the prepared stable release; publication has not yet occurred.

A focused real Desktop Agent run on the stable package retrieved a symbol ID and used it unchanged in a Review Brief call; this single synthetic task does not establish general model correctness. See [the raw record](docs/development/v0.13.0/stable-final-agent-C-results.json).
