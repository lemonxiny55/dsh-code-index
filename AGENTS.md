# Project Task Execution Rules

These rules apply to all work in this repository, especially release gates and runtime diagnostics.

## Keep the task bounded

1. Before starting a release gate, state the smallest observable results that prove the target version's core behavior. Do not add acceptance criteria on your own.
2. Prefer the smallest reproducible fixture. For multi-project isolation, start with two tiny repositories containing distinct marker symbols, then test switching, external add/delete freshness, and change context.
3. Treat automation as a means, not an acceptance criterion. Real manual DSH Web testing, Host API testing, and CLI testing are all valid. If a short manual check gives more direct evidence, recommend that instead of building unnecessary automation.

## Classify failures before investigating

1. Locate the failure layer from observable events. If an Agent request fails during message formatting and there are zero `tool/call` events, the target plugin's tools have not executed; that failure alone does not prove a target-plugin defect.
2. Classify the issue as one of: this plugin, the DSH host/runtime, or another installed extension. Fix this plugin's defects. For host or third-party issues, record a compatibility note and continue the target-plugin gate when possible.
3. Do not debug or modify the host or third-party extensions unless the user explicitly asks, or unless they remain a concrete blocker after the minimal isolation check.

## Isolate once, then stop

1. If an environment-level error prevents the gate, perform one minimal isolation check, such as keeping only `dsh-code-index` enabled while preserving required DSH core services.
2. Define the stop condition before investigating. For example: if the error disappears and the Agent can call the target plugin's tools, classify it as outside this plugin's release gate and stop investigating other producers.
3. Do not continue into profile internals, multiple unrelated plugins, or host framework debugging merely because more investigation is possible.
4. If the proposed next step expands from validating this plugin into changing the profile or diagnosing the host/plugin ecosystem, stop and tell the user what the expanded scope is. Ask whether they want that expansion before proceeding.

## Report proportionally

Report the minimum result needed to decide whether the target plugin passes. Keep host and third-party compatibility observations separate from plugin blockers. Record exactly which verification method was used and avoid claiming that a manual check was performed by automation.

