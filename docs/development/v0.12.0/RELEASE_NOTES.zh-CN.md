# v0.12.0 — Reliable Context & Evidence

已在本地准备，尚未发布。此前公开正式版为 v0.11.2。

Context Pack 以确定性规则识别常见中文任务，区分文件路径与明确符号，优先选择相关实现源码和强关系证据。路径中的英文意图词不再误触发变更或测试分析。

可选 Evidence Summary 为 Context Pack 和变更上下文补充已索引文件的解析状态、exact/import-scoped/name-only 关系、候选测试状态和实际检测到的缺口。Impact X-Ray 保持兼容的元数据和源码检查。

- 默认仍为 5000 字符，边界为 300～20000，最终文本与 Pack JSON 均受限。
- 工具名称和参数兼容。预算不足时 evidence 可缩减或省略；缺省表示未提供，不表示没有缺口。
- 修复正常 npm peer 解析：已声明并验证的 DSH 0.2.1、0.2.2 RC 版本组无需 `--force` 或 `--legacy-peer-deps`。

静态证据不等于运行时证明。parsed 不保证语义完整，未扫描文件不在判断范围。零调用者只指当前索引和静态解析中未发现；未解析目标不等于确定的外部调用。候选测试没有被这些工具执行，也不代表覆盖已验证。

验证依据：此前 Node 22/24 全量各 290 项通过，typecheck、服务端/DTS/客户端构建通过，六个原始 Context Pack 复放通过；相同应用构建通过 rc.3 Host 和真实 Desktop 0.2.2-rc.1 检查。本轮仅新增六项 peer 回归、正常 npm 安装、安装后 SDK 管线小检查及两项真实 Agent 复验，没有因发布元数据变更重跑整套测试。

此前 Agent 的 2048 token 上限、宿主 shell 权限和传输失败均保留原始记录。复验使用临时 8192 token 上限，仅调用指定代码工具，已完成最终回答；没有改动全局认证或代理。这不保证任意 shell 权限、模型服务或网络始终可用。

正式发布后安装：

```sh
dsh plugin --profile desktop add dsh-code-index@0.12.0
```

Host 内第一方 DSH 包应保持同一版本组。具体命令、peer 解析和已知限制见[发布就绪记录](RELEASE_READINESS.zh-CN.md)。
