# dsh-code-index v0.14.0

**Real-Repo Precision & Verification Leads —— 在 AI 修改代码前，精准穿透别名与 barrel 导出、提示最小验证命令、预警变更环依赖并汇总跨包影响。**

本版本围绕真实 TS/JS 业务仓、Monorepo 与鸿蒙 ArkTS 工程显著提升静态关系命中率与评审线索密度，同时严格保持 `exact` / `import-scoped` / `name-only` 证据契约及 `300–20000` JS 字符硬预算：

- **路径别名与有界 Barrel Re-export 穿透：** 轻量解析含 JSONC 注释与尾逗号的 `tsconfig.json` / `jsconfig.json`（`extends`、`baseUrl`、`paths`）、本地 `package.json#exports` 与鸿蒙 `oh-package.json5` 本地相对依赖，并在 `code_refs`、`code_change_context` 与 `Review Brief` 中支持 `export { ... } from` / `export * from` 链穿透（`maxReexportDepth = 3`，`visited` 防环）及确定性 `via` 说明。通配符多匹配严格退化为 `import-scoped` 并写入 `ambiguous-alias`；不解析 `node_modules` / `oh_modules` 与 `@ohos.*` / `@kit.*`。
- **确定性验证命令线索（`commandLead`）：** 在 `Review Brief` 的 `Test Leads` 中基于 `package.json`（Vitest / Jest）、`pyproject.toml`（pytest）、`go.mod` / `go.work`（`go test`）与 `Cargo.toml`（`cargo test`）推导最小范围验证命令。**绝不自动执行测试**（`verification: "not-run"`）；无法识别框架时显式留空并记入 `verification-command-unavailable`，紧预算下优先裁剪 `commandLead` 而保核心变更源码与强调用者。
- **变更环依赖预警（`cycle-warning`）：** 在 `review` 模式下复用 Tarjan SCC（`findCycles`），仅输出包含至少一个本次变更文件的有界环依赖警告，避免无关历史环刷屏。
- **Monorepo 跨包影响与缓存 Schema v5：** 解析 `pnpm-workspace.yaml`、`package.json#workspaces`、`Cargo.toml`、`go.work` 与鸿蒙 `build-profile.json5`，在 `Review Brief` 与 `Impact X-Ray` 中汇总 `Cross-package impact`；缓存 Schema 升至 `5`（含配置 `mtime` 增量失效与热刷新，仍不持久化源码正文）。

本版本保持纯静态分析与非原子元数据边界；本次本地验收涵盖 `pnpm typecheck`、全量单元测试、ESM/DTS/Client 构建与干净 tarball `pnpm release:smoke`（真实 `ToolRuntime` 分发），未在本次额外运行新的 DSH Desktop UI 交互或模型驱动 Agent 实测。详见 [V0.14.0_PLAN.md](V0.14.0_PLAN.md) 与 [RELEASE_EVIDENCE_v0.14.0.md](RELEASE_EVIDENCE_v0.14.0.md)。
