# Official ArkTS parsing corpus

`browser/` preserves all seven `.ets/.ts` sources from OpenHarmony's small
Browser sample at commit `508cda899cc6a6df9c0c6fb6aecec3c275337606`:
https://github.com/openharmony/app_samples/tree/508cda899cc6a6df9c0c6fb6aecec3c275337606/device/Browser
Source copyright/license headers are retained (Apache-2.0). The companion license
is in `APACHE-LICENSE`. These are parser fixtures; the HarmonyOS application has
not been built or run on a device.

`local/` contains **all 15 TypeScript-fenced code blocks**, including the two
intentional explanatory snippets, from OpenHarmony's official `@Local` document:
https://github.com/openharmony/docs/blob/f41b9345badd47c7ab0c263344cd7f4b5a549afb/en/application-dev/ui/state-management/arkts-new-local.md
Blocks retain indentation, comments, and code; no syntax repairs were made.
Their order is document order. These examples exercise ComponentV2/Local/Param,
ObservedV2/Trace, V1 State, nested UI, imports, classes, and callbacks.

`provenance.json` records exact source URLs, SHA256, line counts, and PoC error
counts. Tests read every recorded sample rather than selecting only successes.
This finite corpus is not a general parsing accuracy benchmark.
