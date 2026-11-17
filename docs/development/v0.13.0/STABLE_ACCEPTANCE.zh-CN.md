# v0.13.0 稳定版候选验收

基线 RC.1 提交 `54bbcf04d78e6e821d291ef3e495fa0128aeaed0`。稳定候选包 SHA256 `8ae2a448fafaf7d4b6b73fec0ebbe7df45c72217f2346b7f629c8eb481e1ecb0`；归档为工作树内 Git 忽略的 `release-artifacts/dsh-code-index-0.13.0.tgz`。RC.1 包独立保留，其 SHA256 为 `cb32938de45a17f84e152e9d5cc764c9357bf537fcdb09421ebe670e76e589cf`。完整包文件和 SHA256 见 [manifest](STABLE_PACKAGE_MANIFEST.json)。

## 验证

- Node 22.23.3 全量 329/329；Node 24.19.0 首次 328/329，保留[完整失败记录](stable-test-24-first.json)：一项报告 STACK_TRACE_ERROR，未给出可确定的断言原因。重新运行全量 329/329。两版 typecheck、server、client 和 DTS 构建退出 0。冻结离线 pnpm install 确认 lockfile 一致；pnpm lockfile 的根 importer 不包含项目自身版本字段，故无版本改动。
- 两个空 consumer 正常安装最终包与 DSH 0.2.2-rc.3，无 force、legacy-peer-deps 或 ignore-scripts；npm 保留 prepare allow-scripts 待批准警告，未绕过。两份安装的 25 个文件均与归档逐字节一致。
- rc.3 原生管线 Node [22](stable-final-runtime-22-results.json) / [24](stable-final-runtime-24-results.json) 各 16 次调用，覆盖 Review Brief、text/X-Ray、Context Pack、隔离和 8→0→8→0 生命周期。[Desktop Host](stable-final-desktop-results.json) 临时作用域 22 次调用、8→7→8→7；无本轮 UI 交互。六张截图仍是 [Host API replay](../../assets/v0.13.0/README.md)。
- [真实 Agent](stable-final-agent-C-results.json)：稳定包、合成 C、8192 输出上限。两次只读调用，模型从 code_symbols 获取完整 ID 并原样传入 code_change_context review；结束 completed，零静态关系及未运行测试的边界有说明。仅证明该次任务，不保证其他任务语义正确。
- 首个稳定候选误将先前的 dist/.rc-seal-clean 隔离目录打入包，共 419 文件，SHA256 `f87d3fa90e57812213d75ee6c0135ed52113ab96683af7b026811e971bb49496`。保留于 node_modules/.stable-seal/invalid-dist-contamination.tgz，不作发布候选；对应前序结果也保留。移动临时目录后重新打包及全部安装和管线复验，最终清单 25 文件。
- 2026-11-17 只读查询：git ls-remote 未发现 v0.13.0 tag；GitHub Release API 返回 404；npm registry 对 dsh-code-index@0.13.0 返回 E404。发布前应重新确认远端状态。

未推送、合并、发布 npm 或创建 tag/release；未覆盖稳定 profile。
