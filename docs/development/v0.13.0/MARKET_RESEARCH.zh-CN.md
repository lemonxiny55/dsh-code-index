# v0.13.0 市场调研：Review-Ready Context

调研日期：2026-11-16（Asia/Shanghai）。本报告依据公开文档、公开源码和本项目实测，未安装竞争产品，未进行产品间性能比赛。源码快照及实际阅读文件见 [资料登记](source-register.json)。GitHub 默认分支变化快，下面链接固定到本次读取的提交。

## 判断

建议将 v0.13.0 聚焦为 **Review-Ready Context — Agent-Ready Context & Change Review**：沿用已有 Context Pack、Evidence Summary、Change Context 和 Impact X-Ray，提供一份有预算、能回到真实源码、明确静态边界的 Review Brief。

“一次拿到上下文”“本地图”“修改前影响分析”“支持多个 Agent”已经是竞争产品的共同方向，不能作为本项目独有能力宣传。CodeGraph 也已经列出 DeepSeek Harness 集成。本项目可争取的差异，是 DSH 内无需另配 MCP 的工作流、中文任务选择、ArkTS 既有适配，以及简明且可逐条核查的审阅证据。后两点仍需具体任务验证，不能从功能清单推导效果领先。

## 对比资料和已实现能力

### CodeGraph

快照：`b300cceaee1cc577be72e7bad1e4efef84647e53`。

- [README](https://github.com/colbymchenry/codegraph/blob/b300cceaee1cc577be72e7bad1e4efef84647e53/README.md) 将 `codegraph_explore` 的密集源码、路径和影响上下文作为主工作流。安装 CLI、接入 Agent、为项目建索引是不同步骤；其安装器已列出 DSH，并会维护所选客户端的 MCP 配置和指令片段。
- [ContextBuilder](https://github.com/colbymchenry/codegraph/blob/b300cceaee1cc577be72e7bad1e4efef84647e53/src/context/index.ts) 已有任务检索、子图扩展、入口、源码块、相关文件及格式化输出；低置信度会给出进一步查找建议。因此“任务上下文聚合”是可见实现，并非仅市场口号。单次检索不保证完整回答任意任务。
- [关系解析说明](https://github.com/colbymchenry/codegraph/blob/b300cceaee1cc577be72e7bad1e4efef84647e53/site/src/content/docs/core-concepts/resolution.md) 描述 import、调用与动态分派解析。更广的解析范围仍不能替代运行时证据；本轮未逐语言核验其解析准确率。
- [worktree 检测源码](https://github.com/colbymchenry/codegraph/blob/b300cceaee1cc577be72e7bad1e4efef84647e53/src/sync/worktree.ts) 明确检测在嵌套 worktree 中误借主 checkout 索引的情况，区分 Git common directory。这是实际处理串仓风险的证据；本轮未运行其并发和锁行为。

市场信号：强调减少发现代码所需的工具调用，也主动披露密集结果可能增加会话末尾驻留上下文。其自报 benchmark 受任务、模型、索引版本和计费口径约束，不能转写为本项目收益指标。

启示：应该展示一次查询能得到的可用证据，同时度量输出体积、缺失项和后续补查，而不以“更少工具调用”单独判定质量。

### GitNexus

快照：`2e8f01304eed5384f1ac2ec8a2efee1e1fddf55f`。

- [README](https://github.com/abhigyanpatwari/GitNexus/blob/2e8f01304eed5384f1ac2ec8a2efee1e1fddf55f/README.md) 区分 `query`、`context`、`impact`、`trace`、`detect_changes` 等任务。`analyze` 建索引并可写入指令和技能，`setup` 接入编辑器；`--index-only` 可避免那些仓库侧集成写入。
- [MCP 工具契约](https://github.com/abhigyanpatwari/GitNexus/blob/2e8f01304eed5384f1ac2ec8a2efee1e1fddf55f/gitnexus/src/mcp/tools.ts) 已声明符号源码、分层调用链、变更映射、影响分析和明确的分页/预算选项。`query` 返回执行流及符号，完整审阅仍可能需要 `context` 或 `impact` 的后续查询。
- 同一源码中的 `graph_integrity`、completeness、ambiguity、freshness、边的 confidence/reason 各有不同含义。源码身份和位置验证不能解释为调用解析准确，更不证明运行时可达性。说明竞争产品也在处理证据可信度，而非只画图。
- `detect_changes` 明确提供 linked worktree 发现和显式 `worktree` 参数；多仓查询支持 repo 选择、数组和 group。**能够在 worktree 执行 diff，不自动证明索引是该 worktree 的新鲜源码快照。** 本轮只确认契约，不宣称其完整隔离/并发正确。
- 公开仓库还有审阅类技能与工作流文件，但本轮没有执行它们，不能把存在文件视作多 Agent 审阅效果已验证。

市场信号：定位从“查调用图”延伸到修改、审阅和流程理解。能力面较广，配置和结果契约也更复杂。

启示：不应重复开发 Cypher、跨仓联邦、PDG/污点/重命名引擎。应把已有结果压缩为更容易消费的审阅材料，并显式说明资料不足时需要补查。

### codebase-memory-mcp

快照：`cdfdf26483fa56f4f7d9d85e7c4c3924133b458b`。

- [README](https://github.com/DeusData/codebase-memory-mcp/blob/cdfdf26483fa56f4f7d9d85e7c4c3924133b458b/README.md) 展示搜索、源码、架构、变更影响、测试选择、持久索引、可选 Lens 和多种客户端接入。是更宽的代码情报产品；本轮没有确认它提供与本项目同构的单份任务 Context Pack。
- `detect_changes` 和测试影响、静态图与独立采集的运行轨迹有不同语义。README 所述 Hybrid LSP 是项目的内置类型解析层，不应误写成“已运行编译器/语言服务器，因此关系必然准确”。
- [测试影响类型和契约](https://github.com/DeusData/codebase-memory-mcp/blob/cdfdf26483fa56f4f7d9d85e7c4c3924133b458b/src/mcp/test_impact.h) 包含 convention 模型、coverage map、来源验证及 receipt admission。它已经超出“给出候选测试文件”；我们不应轻率宣称候选测试功能对等，也不应在缺少真实覆盖数据时生成覆盖结论。
- README 明确 linked worktree 默认单独建项目，并说明自动索引、session watcher、共享 daemon 和配置边界。[项目锁实现](https://github.com/DeusData/codebase-memory-mcp/blob/cdfdf26483fa56f4f7d9d85e7c4c3924133b458b/src/daemon/project_lock.c) 存在共享项目集合/单项目 mutation lease，不是只依靠 Agent 指令防并发写入。本轮没有验证锁在所有平台上的实际表现。
- 客户端集成矩阵区分 hooks、父 Agent 转交和子 Agent 直接使用 MCP；不能概括为所有客户端都有相同安全交接。发行的原生二进制减轻运行时安装要求，但仍涉及客户端接入、初次建索引和后台服务的使用理解。

市场信号：用户需要持久、可复用的上下文和跨 Agent 使用方式；benchmark 和支持语言数量是项目方报告，尚不是本项目目标用户的效果证据。

启示：借鉴明确的证据来源、客户端能力分级与保守降级，不在本版本复制 daemon、原生图数据库、覆盖选择系统或 3D 可视化。

## 五个维度的落地结论

| 维度 | 公开证据结论 | dsh-code-index v0.13.0 应做什么 |
| --- | --- | --- |
| 一次取任务上下文 | CodeGraph 已有聚合；GitNexus/CBM 有组合查询；完整性没有共同保证 | 保留 Context Pack，Review Brief 只承诺预算内被选证据，缺口可见 |
| 修改前影响分析 | 三者都有相关实现/工具契约 | 复用 code_change_context 和 X-Ray，不建第二个图 |
| 来源与可信度 | 各项目都有解析层次、歧义或覆盖边界 | 保留 exact/import-scoped/name-only；不把 static、parsed、零调用者升级为运行证明 |
| worktree / Agent | 竞争产品已处理 repo/worktree 身份或交接，但契约不同 | 实测本项目隔离；交接时接收方核对仓库与版本，再重新查询 |
| 首装和演示 | CLI/客户端连接/首次索引是普遍步骤；DSH 已不是无人覆盖市场 | 展示官方 npm 普通安装 + 两文件任务；不要先要求大仓库、外部服务或录屏工程 |

## 我们的产品假设与优先级

1. **P0：Review Brief 可选输出。** 假设：审阅者需要短而可追溯的变更证据，比新增图操作更能直接使用已有分析。本轮内部原型验证可复用，不等于已证明审阅速度或缺陷发现收益。
2. **P0：预算、版本与缺口契约。** 假设：明确 current/base、源码位置、静态等级、测试 not-run 和仓库版本，可减少 Agent 的过度结论。正式实现须专门验证截断和未知状态。
3. **P1：低门槛演示。** 使用两个微型仓库和可复制任务，分别展示源码、影响和缺口。候选测试只说“建议检查”，不说“覆盖通过”。
4. **研究项：结构化上下文交接。** DSH 原语真实存在，但没有现成的 Context Pack 身份/过期校验协议；自动集成 DEFERRED，详见 [计划](PLAN.zh-CN.md)。

不重复开发：独立图引擎、向量模型/云检索服务、通用 MCP 平台、多仓联邦、测试执行/覆盖推断、语义重命名、PR 自动发布、另一个 Agent 调度或任务板、宿主 worktree diff UI。这些会显著扩大质量与维护面，不能解决本轮已确定的最小审阅输出问题。

## 验证假设的下一步

以现有六例 C-phase 原始 Context Pack 回归作为不退化依据，另外选择修改、删除和歧义关系的短审阅任务。记录必需源码是否保留、位置是否一致、候选测试是否被误称执行、重要 gaps 是否仍可见，以及整个输出字符数。公开竞争产品 benchmark 只作为选题信号；在统一任务和环境前，不给出节省 token、耗时或准确率的竞品比较结论。

DSH 依据：[rc.2 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.2)、[rc.3 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3)。rc.2 的 worktree 审阅和统一 SubAgent/AgentTeam 说明方向契合；rc.3 主要新增会话导入并修复 Windows 更新，不因此推导本插件已兼容。实际兼容证据见 [M0](M0_COMPATIBILITY.zh-CN.md)。
