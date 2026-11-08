# v0.12.0 本地候选检查清单

- [x] 审查 M0/M1/M2 完整 diff，仅修复路径中的英文意图词误判。
- [x] 六个原始完整 Context Pack 复放 6/6，无必需源码缺失和无关 primary。
- [x] Node 22/24 全量各 290/290、typecheck、服务端/DTS/客户端构建。
- [x] 实际 pnpm build 退出 0，区分 Windows spawn 启动失败与构建结果。
- [x] 冻结当前代码的 0.12.0-rc.0，24 文件及源码溯源核对。
- [x] 同一候选在 Node 22/24 干净安装，真实 ToolRuntime 各 19 调用。
- [x] 明确 --force 条件，普通 npm prerelease peer 解析未验证。
- [x] rc.3 Web/Host 23 调用、X-Ray 元数据、真实插件生命周期。
- [x] 真实 Desktop 0.2.2-rc.1 后端：候选包、8 工具、22 调用、隔离与刷新。
- [x] Desktop Context/Evidence/X-Ray 页面观察、稳定插件和原字节 profile 恢复；Desktop 边点击未复测，Web 已实测。
- [x] 真实 Agent 中文定位任务：7 调用与完整最终回答保存。
- [ ] Agent 影响/候选测试：max-tokens 未完成，不能视为通过。
- [ ] Agent 0 callers：TRANSPORT 后最终为空，不能视为通过。
- [x] 仅一次无插件隔离；未改全局网络、代理、认证配置。
- [x] README/中文 README/CHANGELOG 说明静态边界、optional evidence 和预算。
- [ ] 本地提交 SHA 与最终状态（收尾补记）。
- [x] 不推送、PR、合并、npm 发布、正式 Tag；root package 仍 0.11.2。

保留为未发布候选；建议补齐未通过的真实 Agent 项后决定正式发布。
详细方法、原始证据与限制见 [集成报告](INTEGRATION.zh-CN.md)。
