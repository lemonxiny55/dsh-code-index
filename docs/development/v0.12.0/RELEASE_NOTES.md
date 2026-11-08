# v0.12.0 — Reliable Context & Evidence

Prepared locally; not yet published. Previous public release: v0.11.2.

Context Packs now recognize common Chinese tasks deterministically, distinguish file paths from explicit symbols, and prioritize relevant implementation source and stronger relationship evidence. English intent words inside paths no longer trigger unrelated change/test analysis.

Optional Evidence Summary adds indexed-file parse status, exact/import-scoped/name-only relationship counts, candidate test status and detected context gaps to Context Packs and change context. Impact X-Ray retains compatible metadata and source inspection.

- Default budget remains 5000 characters, with 300–20000 limits; final text and Pack JSON remain bounded.
- Tool names and parameters stay compatible. Evidence can shrink or be omitted under budget; absence means not provided, not no gaps.
- Normal npm peer resolution now accepts the declared, verified DSH 0.2.1 and 0.2.2 RC groups without `--force` or `--legacy-peer-deps`.

Static evidence is not runtime proof. Parsed files are not a guarantee of semantic completeness; unscanned files are not assessed. Zero callers means none found in the current index/static resolution. Unresolved targets are not established external calls. Candidate tests have not been run by these tools and do not prove coverage.

Validation: prior Node 22/24 full suites each passed 290 tests, with typecheck and server/DTS/client builds; six original Context Pack replays passed. The same application build passed rc.3 Host and Desktop 0.2.2-rc.1 checks. This final round adds six peer regressions, normal npm installs, a focused normally installed SDK pipeline check and two completed real-Agent rechecks. The full suite was not repeated for metadata-only release changes.

Earlier Agent failures remain in the evidence history: a 2048-token cap, a Host shell permission failure and a transport failure. Focused rechecks completed with a temporary 8192-token cap and only the requested code tools; no global authentication/proxy settings were changed. This does not promise unrestricted shell access or reliable model/network service.

After publication:

```sh
dsh plugin --profile desktop add dsh-code-index@0.12.0
```

Keep the Host's first-party DSH packages on a matched version group. See [release readiness](RELEASE_READINESS.zh-CN.md) for exact commands, peer results and remaining limits.
