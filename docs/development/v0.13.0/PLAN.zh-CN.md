# v0.13.0 第一阶段落地与后续实施

日期：2026-11-16（Asia/Shanghai）。主题：**Review-Ready Context — Agent-Ready Context & Change Review**。

## 当前状态

已完成公开源码竞争调研、rc.3 分层兼容检查和 Review Brief 内部原型。建议下一阶段正式实现可选 Review Brief；自动 AgentTeam 上下文交接保留为研究项。本轮没有向用户工具注册 `review` 输出，也没有把原型计作已交付的公共功能。

独立分支：`codex/review-ready-context-v0.13.0`。从本轮 fetch 后的 `origin/main` `a247690a5cb2c72152347cab482760193a0447f7` 建立。工作树：`D:\ChatGPTProjects\dsh-code-index\node_modules\.v013-dev`。根工作区、已授权媒体删除和其他未确认文档修改均保留；没有读取 `HANDOFF_PROMPT.md`。

已读取 AGENTS、v0.12.0 REPORT、集成与发布就绪/发布说明；其中 INTEGRATION 的暂缓结论被后来的 RELEASE_READINESS 更新，不能把历史阶段状态当作当前未发布。npm 实际安装的版本为 0.12.0。

## 建议正式纳入的范围

| 优先级 | 范围 | 最小实现与边界 |
| --- | --- | --- |
| P0 | code_change_context 可选 Review Brief | 同一次选择、同一 ChangeContextResult 派生，默认 text 和 xray 不变 |
| P0 | 审阅证据契约 | 变更摘要、真实实现源码、静态影响、候选测试、缺口、仓库/基线版本 |
| P0 | 预算与回归 | 默认 5000 字符；现有 Context Pack 的 300～20000 双预算继续保持；不靠提高预算掩盖遗漏 |
| P1 | 两文件演示与中文指引 | 普通 npm 安装、一次只读审阅任务，公开小夹具；不要求新图服务 |
| DEFERRED | 自动 AgentTeam 交接 | 原语存在，但尚无验证过的身份/过期/接收方范围契约 |

不是本版本目标：大规模路由/解析重构、新图引擎、宿主核心改动、Team 调度器、自动跑测试、覆盖证明、PR/发布自动化。

## 建议接口契约（草案，尚未注册）

```ts
code_change_context({
  ...existingSelection, // diff / files / symbols / Git selection; 保留已有互斥与优先规则
  outputFormat: 'review',
  budgetChars?: number, // 仅 review 消费；默认5000，300..20000
}) -> { text: string, brief: ReviewBriefV1 }
```

1. 未传 `outputFormat`、`text` 和 `xray` 的返回值、渲染及 presentation metadata 不改动。`budgetChars` 不改变现有 text/xray 行为。公开 schema 增加前需补原生管线契约测试。
2. `ReviewBriefV1` 明确 `version: 1`；摘要记录选择来源和**分析识别到的数量**，不得伪装为预算内完整源码数量。无 diff、文件选择、无 Git 等状态分别说明。
3. `repository` 记录实际 worktree root、解析后的 HEAD/base、索引时间；正式实现补充 Git dirty 状态与采集时间/非原子快照说明。不能把相同 HEAD 当作相同工作区内容，更不能只用 Git common-dir 作为 worktree 身份。
4. `changes` 保存 name/change、file/startLine/endLine、current/base、ref、源码模式和整行 code；签名降级独立标记，不冒充实现源码。删除侧用已解析的不可变 base commit 读取。
5. `relations` 引用现有影响行，保留整条路径的最弱 resolution 和 reason；需要深入复核时关联现有 X-Ray。没有关系只表示当前静态/索引范围未发现。
6. `tests` 只有候选和选择理由，`verification: 'not-run'`；不推断运行成功或覆盖。未来实际测试证据必须有命令、退出码和来源，另行设计。
7. `gaps` 区分预算省略、signature-only、未映射变化、上游截断、解析不完整和仓库版本不可得。字段缺失不能解释为零缺口。
8. 对完整 `{text, brief}` envelope 计费，避免文本和 DTO 重复传送造成隐藏超支。空间不足时返回明确的预算降级，不裁断源码行或 JSON；不能悄悄扩大默认预算。

### 本轮内部原型

[prototypes/review-brief.ts](../../../prototypes/review-brief.ts) 直接接收现有 `RepoIndex` 和 `ChangeContextResult`，复用 `sourceReader` / `excerptVariants`；不重新路由任务，不执行第二次图分析，不启动 Agent 或传输上下文。它不在 `src/index.ts` 导出，未进入公开工具 schema，也不改变发布包版本。

已验证六项：真实实现与位置/关系/测试标签；删除侧 base 源码；过期当前源码降为签名；300/500/1000/5000/20000 的完整 envelope 上限；原始 Context Pack 和输入分析对象不变；跨仓 root 不匹配拒绝。

原型限制必须在正式实现解决：

- 没有原子快照或 dirty 内容身份；HEAD 仅为采集时信息，不能授权安全跨 Agent 复用。
- 先放变更源码再放关系/测试；大变更可能挤掉后两类。正式选择需为每类最少信息分配预算，并返回明确省略计数。
- gaps 使用通用预算说明，细粒度上游 gaps 在极小预算下可能放不下；不能把该原型宣传为完整 Evidence Summary。
- Git 读取最多等待 3 秒；无 Git 返回版本不可得。sourceReader 沿用既有 mtime/大小检查，不能声称防住相同 mtime 的所有并发改写。
- 目前没有公共 JSON Schema、review renderer、原生工具注册或最终 UI 卡片；内部成功不代表这些已完成。

## AgentTeam / SubAgent 可行性

源码、安装的 rc.3 类型声明、现有 Desktop 服务均已核对。真实入口是：

- `ctx.subagents.startActivation(spec)`：provider、parent、prompt（`ContentBlock[]`）、signal、delivery 等；可选 cwd、outputSchema、provider capability。`outputSchema` 约束子 Agent 的结果，不是输入 Context Pack 的交接通道。
- `ctx.subagents.sendMessage(...)` 和模型工具 `subagent` / `subagent_fork` / `send_message` / `list_agents` / `wait_agent`。模型工具与服务的参数契约不同，不能互相套用。
- `ctx.agentTeams`：根 Session 的 Team mode、共享任务板、版本化任务所有权；模型工具为 `team_task_create/list/get/update`。创建和通信属于 SubAgent，不再是另一个 Team 成员管理器。
- Team 默认关闭；`defaultEnabled` 只作用于符合条件的新根 Session。已有 Session 保留选择。默认内置 composition 禁用 interrupt 工具，不等于不存在 service 方法。
- Team 共享工作目录和文件系统，writeScopes 是提示而非锁；SubAgent 的显式 cwd 不是权限隔离。Fork 会继承完成的历史，不能称为只传选中 Pack。

资料：[SubAgent 服务](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/subagent/subagent/README.md)、[delegation tool](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/subagent/tool-subagent/README.md)、[control tools](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/subagent/tool-subagent-control/README.md)、[Team 服务](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/team/agent-team/README.md)、[Team tools](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/team/tool-agent-team/README.md)。

**结论：原语可用；自动结构化交接 DEFERRED。** 可以在现有父 Agent 明确选择后，把预算内 Pack 序列化为新子 Agent prompt 的一段文本，不需要改宿主；但没有发现标准化的 Pack 附件、仓库能力令牌、过期校验或接收方数据最小化协议。不要发明 `ctx.agentTeams.attachContextPack` 一类 API。

下一阶段如继续研究，应先用合成仓库做一次 fresh spawn，限定同一已授权执行方；不要用 fork 代替最小交接，不自动发送到外部 provider，不写共享云存储。接收方校验 worktree/root、HEAD/base 和 dirty 身份，发生变化重新查询。现有 Tools 的 repoRoot 选择不是授权边界，Pack 自身也不能建立沙箱。若要求跨 provider 或只允许严格不可外发的私有源码，则该自动路径仍 BLOCKED，需另行明确可信执行边界。

## 质量指标与后续门槛

以下分开记录本轮测量和下一阶段目标，后者不追加到本轮兼容验收条件：

| 项目 | 本轮证据 | 正式实现目标 |
| --- | --- | --- |
| 原有回归 | 296 原有 + 6 原型 = 302/302，Node 24.19.0 | 原有六例 C-phase 必需实现召回不退化、无无关 primary；不提高 8000 固定预算 |
| Review 预算 | 五档完整 envelope 通过 | 默认5000、边界300..20000均明确降级；文本/DTO/元数据统一预算 |
| 源码可信度 | 整行源码、base 删除、过期降级通过 | 每段位置与 current/base/ref 可复核，signature-only 不能当源码 |
| 静态与测试标签 | 复用等级，not-run通过 | 不升级 name-only/最弱路径，不出现未经执行的测试成功或覆盖结论 |
| 旧接口 | src/manifest/lock 未改，完整回归和构建通过 | 未指定 review 时 text/xray 值、呈现和 Pack 预算保持 |
| 仓库隔离 | 原生24调用 + 当前Desktop6调用 | 不混用 worktree/仓库；内容变化后旧交接不能静默沿用 |
| 审阅收益 | 尚未测量 | 新任务分别记录必需证据、遗漏与补查，不先承诺耗时/token收益 |

实施顺序：先完善 DTO/gaps/类别预算和版本采集，再将唯一 `review` 分支接入现有工具；补注册与输出契约测试后，运行已有完整回归、构建、已发布包与新包分层兼容验收。最后做一次真实 Desktop 卡片/文本展示核查。自动交接不阻塞 Review Brief，但不能搭便车宣称已支持。

本轮只提交本地研究、诊断证据和内部原型；不推送、不创建 PR、不发布 npm、不改稳定 profile。详细兼容范围见 [M0](M0_COMPATIBILITY.zh-CN.md)。
