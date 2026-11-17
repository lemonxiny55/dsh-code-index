# dsh-code-index v0.13.0

**Review Brief —— AI 修改代码前，先检查潜在影响与证据。**

本候选版为 `code_change_context` 增加可选 Review Brief。传入 `outputFormat: "review"` 可查看有界的变更符号源码、静态关系、候选测试、仓库观察和证据缺口。默认 text、X-Ray 和原始 Context Pack 仍可使用。见[可复现教程](docs/development/v0.13.0/DEMO.zh-CN.md)。

完整 JSON 默认预算为 5000 个 JavaScript 字符（300–20000），不是 token 上限，也不含宿主开销。候选测试未运行、覆盖未验证；静态关系不证明运行时影响，证据缺失不代表不存在，仓库元数据是非原子观察。`symbols` 应使用 `code_symbols` 返回的精确 ID，或省略以使用工作区 diff。

DSH Desktop 0.2.2-rc.3 与 Agent 的范围和限制见 [M2 验收](docs/development/v0.13.0/M2_ACCEPTANCE.zh-CN.md)。六张截图明确标为 [Host API 回放](docs/assets/v0.13.0/README.md)，不是模型成功截图。B 首次在 4096 token 上限结束，8192 重试完成；完成的 Agent 任务仍存在已记录的推理错误。

自动 AgentTeam 交接、完整前后 diff、调用者和测试源码、专用 Review Brief 卡片及大规模 ArkTS 解析升级继续暂缓。正式版已在本地准备，尚未发布 npm。

稳定包的单次真实 Desktop Agent 复验中，模型获取符号 ID 并原样用于 Review Brief；这一合成任务不证明模型普遍正确。见[原始记录](docs/development/v0.13.0/stable-final-agent-C-results.json)。
