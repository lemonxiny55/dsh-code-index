# v0.13.0 M0：DSH rc.3 兼容实测与阶段暂停

日期：2026-11-16（Asia/Shanghai）。按用户要求在本阶段暂停；不继续公共功能接入。

## 结论和最小验收范围

**已发布 v0.12.0 的普通 npm 安装、rc.3 原生工具管线和真实 headless Agent 通过；现有 Desktop Host API 通过。目标 X-Ray 卡片最终渲染尚未完成核查。** 不扩大为“全部 Desktop UI / 所有 SDK / 全部 AgentTeam 兼容”。

验收前限定的可观察结果：安装与工具注册成功；获取真实源码和 X-Ray；两个微型 Git 仓库 A/B/A 切换及 linked worktree 不串仓；外部增删可刷新；工具可卸载重载；真实 Agent 的工具调用与最终回答单独记录。没有增加宿主或其他插件排障作为放行条件。

## 基线和环境

- 已从 fetch 后 `origin/main` 的 `a247690a5cb2c72152347cab482760193a0447f7` 建立 `codex/review-ready-context-v0.13.0`。
- 开发 worktree：`D:\ChatGPTProjects\dsh-code-index\node_modules\.v013-dev`。保留原工作区所有既有文档修改、未跟踪文件和已授权媒体删除；没有读取或修改 `HANDOFF_PROMPT.md`。
- 本轮命令环境：Windows x64，Node 24.19.0。安装目录为该 worktree 的 `node_modules/.m0-host`，npm 内容缓存也放在 worktree 内。没有改全局 npm 配置。
- 实际安装：`dsh-code-index 0.12.0`、`@deepseek-ai/dsh 0.2.2-rc.3`、`@deepseek-ai/dsh-tools 0.2.2-rc.3`、Cordis 4.1.0。npm `latest` 与 `next` 不同，本轮明确选 rc.3；没有用 PATH 上旧全局 CLI 冒充目标运行时。
- 本机 Desktop runtime manifest 为 0.2.2-rc.3，随附 Node 24.21.0。实际工具运行结果见原始记录，不推导 Node 22 或未来 Host 已验证。

## 分层结果

| 方法 | 本轮结果 | 明确边界 |
| --- | --- | --- |
| 普通 npm 安装发布包与rc.3 | PASS，676 packages，退出0 | 无 force、legacy-peer-deps、ignore-scripts；npm 11 的 allow-scripts 待批准警告保留，未绕过 |
| rc.3 SDK 原语：真实 Cordis + ToolsService + NativeToolExecutor | PASS，24次调用、8工具 | 这是原生工具SDK组合，不是高级 JSON-RPC SDK client 验收 |
| 工具源码和预算 | PASS | Context text/pack 为300、500、5000、20000；默认档包含 `return 43` |
| Change / X-Ray | PASS | text内容一致，card为impact-xray，测试证据为not-run；不等于前端最终绘制已核查 |
| 仓库 / linked worktree | PASS | ALPHA/BETA/WORKTREE distinct markers，A/B/A、worktree变更不串仓 |
| 外部刷新 | PASS | 独立子进程添加/删除，下一次查询出现/消失 |
| 生命周期 | PASS | 真实Cordis load/dispose/reload，工具数8→0→8→0 |
| 真实 headless Agent | PASS | rc.3官方CLI，deepseek-official / deepseek-flash / high，2次目标工具调用，completed，退出0，约36.8秒 |
| 用户现有 Desktop Host API | PASS，6次调用、7个默认工具 | 官方已启用Inspector附着既有Host；未修改profile、未启用code_health |
| Desktop UI | PARTIAL / 未完成目标渲染核查 | 实际观察到现有应用、新会话及夹具工作区页面；未验证本轮X-Ray卡片与源码跳转 |
| AgentTeam自动交接 | DEFERRED | 服务和方法存在，但没有执行子Agent交接或证明安全协议 |

普通安装命令：

```powershell
npm install --prefix node_modules/.m0-host --no-audit --no-fund @deepseek-ai/dsh@0.2.2-rc.3 dsh-code-index@0.12.0
```

原生门禁执行 `node docs/development/v0.13.0/m0-native-gate.mjs`。实际源码查询、工具输出、版本和路径见 [原生结果](m0-native-results.json)。测试夹具只有两个微型仓库，worktree从B创建。

真实模型执行 `node docs/development/v0.13.0/m0-agent-gate.mjs`，使用临时 DSH_HOME 和既有模型路由，只发送合成源码。调用 `code_context` 和 `code_change_context(outputFormat:xray)` 后完成回答，明确候选测试未执行及静态边界；未调用shell、未修改文件。本轮没有传输失败，故未执行额外隔离模型请求。[摘要](m0-agent-results.json)、[原始CLI事件](agent-target/stdout.jsonl)。模型个别“唯一影响”等措辞仍需结合其索引范围声明理解；一次小任务不能证明一般审阅推理可靠性。

## 现有 Desktop：按用户最新要求直接使用

最初尝试了临时 Desktop 实例，启动注册日志存在，但读取窗口时遇到 `Computer Use app approval timed out`，未取得目标结果展示；这些尝试不记作UI成功，也未完成临时Host探针。临时实例已结束。

随后用户要求不隔离、直接使用现有 Desktop。打开原有应用并新增了一个夹具工作区 `a` 和空白新会话，没有更改 profile 或插件配置。用户又要求优先不用 Computer Use，随即停止该方法。

替代入口是**已经启用**的官方 `@deepseek-ai/dsh-experimental-inspector`：本机已有9230端口，`/json/list` 返回 `DeepSeek Harness Host`。通过其公开支持的 `DOM.getDocument` / `DOM.resolveNode` 取得实际 Host Context，再调用真实 `ctx.tools.execute`。没有注入新插件、修改宿主核心、启用调试开关或扫描其他插件内部。

执行 `node docs/development/v0.13.0/m0-desktop-api.mjs gate`，6次调用验证：Context Pack真实实现、change text、X-Ray metadata与文本一致、B→A隔离、worktree变更。见 [Desktop直接结果](m0-desktop-direct-results.json)。API会话结束即断开Inspector；没有关闭用户现有Desktop。

当前 Desktop 是链接安装，原工作区 `package.json` 仍为0.11.2，保留用户稳定环境；其 `dist/index.js` 与本轮npm安装0.12.0的服务端文件SHA-256相同：

`58476ae3d5b83567acc5f5e5db835743f255b560535740b2da04a66b50ad1d8a`

因此只声明**同字节服务端代码的Desktop Host行为**。没有把链接manifest改成0.12.0，也没有证明当前客户端bundle与npm发布包字节相同。现有profile默认7工具，`code_health`为可选项；不为凑8个工具更改配置。

Inspector的Host方法存在并不证明前端卡片绘制成功。后续可以沿用该既有API入口；本阶段不继续用Computer Use、不继续深挖宿主框架。

## SDK、构建与原始 Context Pack 回归

本轮开发分支没有改 `src/`、package.json或lockfile；原型位于 `prototypes/review-brief.ts`，尚未公开导出或注册工具。新测试6项，加上原有296项，共32个测试文件、**302通过、0失败**。包括原有六例C-phase、Context Pack预算、源码/关系/语言、隔离与刷新回归。

typecheck、服务端tsup/DTS和客户端tsup均退出0。具体命令、安装包integrity和测试摘要见 [verification.json](verification.json)。原始全量测试JSON/log留在该worktree的 `node_modules/verification-tests.*`；没有以历史测试结果冒充本轮运行。

这里没有重装项目devDependencies，也未将全量源码测试伪称为rc.3高级SDK测试。rc.3兼容证据来自另外正常安装的发布包与实际运行时组合。

## 失败分类和停止边界

| 观察 | 分类与处理 |
| --- | --- |
| 初始git fetch写FETCH_HEAD被沙箱拒绝 | 执行环境权限；按授权升级完成fetch/worktree，不是插件失败 |
| npm默认缓存写入被拒绝 | 执行环境权限；改本worktree局部缓存，正常安装完成 |
| Vitest默认临时目录rename EPERM；沙箱内源码摘录失败 | 执行环境；同范围非沙箱检查后通过，未改产品断言 |
| 把TEMP放在worktree内时，“无Git”夹具看到了父仓库 | 验收夹具环境；恢复正常系统临时目录后完整302/302，未放宽测试 |
| 原生测试组合第一次缺少executor，TOOL_EXECUTOR_UNAVAILABLE | 门禁组合缺少官方NativeToolExecutor；插件已经注册但尚未执行，补齐后24调用通过 |
| 临时Desktop窗口授权超时 | 控制通道限制，不归因目标插件；用户改为现有Desktop后用已有Inspector Host API继续 |

未出现需要调查其他扩展的具体失败，未修改或排查其他插件。若下一次真实Agent在message formatting阶段失败且零 `tool/call`，仍应归类宿主/其他producer，不能据此判插件故障。一次最小隔离后仍受阻就停止扩展调查；本轮不改变这项规则。

稳定 Desktop manifest、patch和认证文件指纹核对保持不变，见 [保护文件检查](protected-files.json)；认证值未写入报告。资料只保存合成任务及必要版本/路径证据，没有上传私有仓库代码。

## 阶段停点

可以继续：完善Review Brief的类别预算、显式省略与版本契约，再接入唯一可选 `review` 输出。待办：真实目标卡片展示/源码交互、高级SDK客户端单独验收、正式Review接口、dirty/接收方校验、AgentTeam合成数据交接。

本轮未推送、未创建PR、未发布npm、未改稳定profile；package版本保持0.12.0。调研结论见 [市场报告](MARKET_RESEARCH.zh-CN.md)，接口与优先级见 [计划](PLAN.zh-CN.md)。用户返回前不继续实施。
