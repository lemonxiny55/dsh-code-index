# v0.13.0-rc.1 本地候选验收

2026-11-17，Asia/Shanghai。基线提交 8b17709413e396f9c7d5380f4fc34c3d0d17f3a9；本记录和 RC 修改在该提交后的工作树中。候选包 SHA256：`cb32938de45a17f84e152e9d5cc764c9357bf537fcdb09421ebe670e76e589cf`。归档：`release-artifacts/dsh-code-index-0.13.0-rc.1.tgz`（Git 忽略的本地封存文件；原始副本保留在 `node_modules/.rc-final2/`）。完整包内文件清单及 SHA256 见 [RC_PACKAGE_MANIFEST.json](RC_PACKAGE_MANIFEST.json)。未推送、发布或打标签。

## 结论与边界

PASS（本地 RC 门禁）；未发现插件级阻断。Review Brief 的实现和 M1/M2 各阶段结论相符；M1 传输失败与 M2 后续实测分别保留，不能互相覆盖。六张真实截图仍是明确标记的 Host API 回放，不是模型成功截图。最终候选 client.js 与 M2 使用的 client 字节一致；本轮 Desktop 是 Host 工具管线复验，不重复宣称 UI 操作。

符号短名误用暴露插件契约缺口：code_symbols 的结构化结果有 ID，但模型可见文本没有；现已输出精确 ID，并补充真实 SDK 管线回归测试，不做模糊匹配。调用方向和缺乏旧源码时的断言属于 Agent 推理错误；补充静态调用方向、证据和未运行测试边界。B 首次 max-tokens 是模型输出上限，非字符预算或插件异常；8192 重试完成并不保证语义正确。保留 [M2 原始四次记录](M2_ACCEPTANCE.zh-CN.md)。ID 输出修复前候选的 [C 复验](rc-agent-C-results.json) 在仅开放目标工具的作用域用 files 选择，2 次调用后完成，指出不能把零关系等同零运行时用户；不代表普遍正确。

## 检查

- Node 22.23.3 与 Node 24.19.0：修复后全量各 33 文件、329 测试通过，typecheck 退出 0；server、client 和 DTS 构建退出 0。新增测试验证模型可见结果包含实际符号 ID。
- 两个空 consumer 正常 npm install 最终 tarball 和 rc.3，无 force、legacy-peer-deps 或 ignore-scripts；npm 提示 prepare 脚本待批准，未绕过。安装的 index.js、index.d.ts、client.js 与工作树 dist 的 SHA256 分别一致。
- 安装包通过 Node [22](rc2-runtime-22-results.json) / [24](rc2-runtime-24-results.json) rc.3 原生管线，各 16 次调用：六档预算、review/text/xray、原始 Context Pack、A/B/A 和 linked worktree、加载卸载。完整测试覆盖外部增删刷新。
- [Desktop rc.3](rc2-desktop-results.json)：临时 Agent 作用域 22 次 Host 工具调用，8→7→8→7，全局工具集合不变；无本轮 UI 交互。原始 UI 与截图见 [M2](M2_ACCEPTANCE.zh-CN.md) 和 [来源](../../assets/v0.13.0/README.md)。
- 执行环境的首次测试因系统临时缓存 EPERM 未执行任何测试；误用父目录不同依赖的 typecheck 失败；离线安装缺少 rc.3 元数据失败。恢复锁定依赖、正常安装后重跑如上。预验脚本曾记录旧归档哈希，已修正并重跑；历史结果不作为最终 RC 证据。

未扩展 AgentTeam 自动交接、完整 diff、调用者/测试正文、Review 富卡片或 ArkTS 深度解析。
