# v0.12.0 开发记录：Reliable Context & Evidence

2026-11-08 最后一轮：修复正常 npm RC peer 阻断，两项真实 Agent 有限复验均完成；本地版本准备为 0.12.0，尚未发布。最新结论、双语 Release Notes 和 PR 草稿见 [发布就绪记录](RELEASE_READINESS.zh-CN.md)。

2026-11-08：最终集成验收及本地候选准备见 [集成报告](INTEGRATION.zh-CN.md) 和 [候选检查清单](CANDIDATE_CHECKLIST.zh-CN.md)。其中真实 Agent 未完成项单独保留，不算通过。

2026-11-05：M2 Context Evidence Summary 已实现，见 [M2 开发与验证记录](M2.zh-CN.md)。
以下保留 2026-11-04 的 M0/M1 原始记录与当时的阶段边界。

日期：2026-11-04（Asia/Shanghai）。本轮完成 M0 + M1；没有实现 M2。
起点为 `f61904957c731be6d30aa288f790bc970a2504b5`，本地开发分支
`codex/reliable-context-v0.12.0`。`package.json` 仍为 `0.11.2`。

## M0：质量基线与判定方法

已阅读根 AGENTS、双语 README，以及 C 阶段 DESIGN、报告、质量审计和 summary。
沿用原三个任务及其两次重复，共六例，不把它们当作六个独立任务。
原始 C 阶段有效 Agent 样本仍为 0；本轮没有重启该模型实验。

新增 `tests/context-c-phase.spec.ts` 和固定夹具。九个完整历史真实文件保留
scanner → index/cache → manager → tools 路径及四个会污染排名的 `repo` helpers。
T1/T2 使用修复前快照；T3 用真实 Git HEAD 与两个已知修复文件制造工作区 diff。
测试不依赖原 scratch 或 Git 历史，完整文件来源与原输入 SHA-256 见夹具 README/JSON。

每例记录原输入、预期关键实现、实际源码召回、已知噪声、文本/JSON 字符数和 gaps。
必须返回关键实现表达式（例如 `matcher.ignores(...)`、`scanRepo(...)`、
watcher 的 `isGitIgnoredPath(...)`），不能只有名字或声明头。
逐段验证真实文件与行号；预算沿用原始 8000，禁止用提高预算掩盖遗漏。

修改前基线使用隔离目录中的起点生产源码，运行同一份最终质量断言：**0 通过 / 6 失败**。
修改后固定夹具 **6/6 通过**；又在原始完整六个 C3 trial 上实际复放，**6/6 通过**。
没有放宽召回、噪声、源码或预算断言；实施过程中补强了关键分支代码断言。

| 样本 | 修改前路由 → 修改后路由 | 关键实现召回（固定夹具） | 修改后文本 / JSON 字符 |
| --- | --- | --- | --- |
| T1-C3-r1 | ambiguous → exploration | 0/5 → 5/5 | 6870 / 7916 |
| T1-C3-r2 | ambiguous → exploration | 0/5 → 5/5 | 6870 / 7916 |
| T2-C3-r1 | ambiguous → change | 0/3 → 3/3 | 6957 / 7996 |
| T2-C3-r2 | ambiguous → change | 0/3 → 3/3 | 6957 / 7996 |
| T3-C3-r1 | symbol → change | 0/5 → 5/5 | 6988 / 7966 |
| T3-C3-r2 | symbol → change | 0/5 → 5/5 | 6988 / 7966 |

预算均为 8000。固定夹具修改前 T1/T2 为 592 文本字符，T3 为 6743；
这些不是历史完整包的 758 / 6847 字符，不能混为同一次测量。
T3 修改前有三个已知无关测试文件的 `repo` helper 成为 primary；修改后为零，
路径中的 `repo` 不再获得 exact-symbol 加权。相关测试仍只能作为候选。

完整历史树的补充复放结果（各重复两次一致）：

| 任务 | 返回关键实现 | 文本 / JSON 字符 |
| --- | --- | --- |
| T1 | isGitIgnoredPath、scanRepo、buildIndex、buildIndexWithCache、getIndex | 6869 / 7970 |
| T2 | isGitIgnoredPath、scanRepo、attachWatcher | 6888 / 7987 |
| T3 | ignoredByGitLayers、isGitIgnoredPath、scanRepo、attachWatcher、refresh | 7069 / 7996 |

记录分别为 `m0-before.json`、`m0-after.json`、`full-trial-after.json`；
测试原始结果另保存在同目录。这是直接执行生产 `buildTaskContext` 的自动测试，
不是本轮新的 DSH ToolRuntime、Desktop 手工验收或模型驱动运行。

## M1：实际代码修改

### 路由与词项

- 中文确定性规则覆盖修复错误、排查异常、修改代码、分析变更影响、查找测试、
  分析测试覆盖、查找函数、定位实现、理解架构和调用流程。
- 中文修复/变更主句优先于附带的补测试要求；剔除“不要修改代码”等禁止动作，
  避免只读定位任务被误路由到 change。原英文分类回归用例继续通过。
- `context-terms.ts` 集中维护小型可解释词表，把忽略、扫描、索引、监听、配置加载等
  常见术语映射为现有标识符词项；增加有限词形归一化。没有模型、嵌入或远程依赖。

### 路径、符号与排序

- 先遮蔽真实/未知文件路径和目录 glob，再识别显式标识符；文件匹配使用完整路径或
  路径后缀边界，避免把 `.ts` 当作 `.tsx`。
- `Namespace.repo()` 等成员表达式保留；反引号、引号、调用语法和“函数 repo”等
  明确提及仍能查找同名符号。普通 prose 中的 repo/src/git 不作高置信度符号。
  长句内常见任务词汇保持 lexical，其他声明名、短聚焦查询与代码形状名称保留 exact 查找。
- 声明名称词项权重大于签名/路径词项；执行声明优先于容器和字段。
  未明确请求的测试 helper 降权，测试文件变更不会单凭 Git 加权挤占源码 primary。
  `code_search` 的既有排序 API 没有改动。

### 选择、扩展与证据

- 前四个 primary、真实 current change、强直接关系、有限跨层 caller、前两个相关测试、
  其他 primary/import/关系摘要按明确优先级分配预算；多 primary 时限制单段摘录占用。
  长声明优先选择任务相关调用/条件所在的整行窗口，保留 source side/ref 与去重逻辑。
- 只复用现有影响分析，跨层源码最多四项，直接邻域原有上限保持不变。
  内部可选 `focusFiles` 使任务点名文件及其已发现中间 hop 在 40 项截断前优先；
  不增加深度、候选上限或图边，不改变默认 Impact X-Ray 分析。
- 原始完整树暴露了大量 `get` name-only 命中抢先耗尽候选的问题。补充了 55 个
  同名噪声调用的最小压力测试，验证关键三层 caller 保留且仍标注 name-only，
  中间 hop 也不会被截掉后留下孤立的候选。
- 跨层项保留整条路径最弱等级；最后一跳为 exact 也不会把整条 name-only 路径升级。
  未修改 parser 或引用解析器，没有新增调用关系。
- 所有测试项明确标为 `candidate test (not verified coverage)`。普通 seed-test 与
  真正 Git 修改的测试声明分别描述，防止复用的 changed-test 内部原因被误读。
  这是 M1 的标签修复，没有实现 M2 Evidence Summary。

默认 5000、300～20000 边界、文本/JSON 双重硬约束、工具名称与参数保持不变。
新增默认值、非法值、上下界和中英等价配置任务回归；原隔离、刷新、预算和语言测试通过。

## 验证与环境

Windows x64；Node **24.22.1** 与本机已有 Node **22.23.3**。
Vitest 4.1.11，tsup 8.5.1；依赖没有升级或重装。

| 检查 | Node 24 | Node 22 |
| --- | --- | --- |
| 全量测试（29 文件，含六例 M0、context-quality、search/tools、ArkTS/Rust/X-Ray、隔离刷新） | 275 通过，0 失败，0 跳过 | 275 通过，0 失败，0 跳过 |
| TypeScript `tsc --noEmit` | 通过 | 通过 |
| 服务端 tsup + DTS | 通过 | 通过 |
| 客户端 tsup | 通过 | 通过 |

测试命令：`node node_modules/vitest/vitest.mjs run --reporter=json --outputFile=...`。
typecheck：`node node_modules/typescript/bin/tsc --noEmit`。
构建：`node node_modules/tsup/dist/cli-default.js`，然后同命令追加
`--config tsup.client.config.ts`。Node 22 使用其 `node.exe` 执行相同入口。
六例可以单独运行：`node node_modules/vitest/vitest.mjs run tests/context-c-phase.spec.ts`。

`pnpm build` 包装命令触发当前包管理器的自动依赖检查，因 store SQLite 权限错误失败；
没有修改全局 store 或 profile，转而直接运行项目 build 脚本对应的两个本地 tsup 入口。
上表构建通过指实际 tsup 与 DTS 检查，不声称 pnpm 包装命令通过。
本会话 PATH 也没有 `npm` 命令，因此没有将 `npm run build` 算作已通过。

原 tools cwd 回退测试依赖开发者完整工作区，5 秒和单独 30 秒复核均超时。
已改为仅 mock `process.cwd()` 到既有微型真实 Git 夹具，仍执行 root discovery、扫描和索引，
断言从“返回非空字符串”加强为“正确 repo 路径及两个已索引文件”；没有放宽正确性标准。

## 保留边界与 M2 建议

- 中文词表是有限规则，不保证任意中文领域语义都能映射到任意项目的命名。
- 完整历史树的 TSX partial 警告仍保留；它不解释原 scanner 源码遗漏，本轮不修 parser。
- 泛型 `get` 等 name-only 静态候选仍可能存在；改进的是选择顺序和标签，不把它们宣称为
  确定运行调用。源码窗口有界，不保证一个 Pack 包含所有实现或测试断言。
- 没有实际运行候选项目的测试，因此 Pack 不能声称覆盖已经验证。这里运行的是插件回归测试。
- 现有 `budget.truncated` 仍兼有任务摘要 120 字符截断含义；不能单凭 trimmed 判断核心源码被裁掉。
- 本轮没有新增 Desktop/Host/Agent 验收，也不把历史 TRANSPORT 问题算作插件质量失败。
  未推送、创建 PR、打 Tag、发布或合并，未修改或读取 `HANDOFF_PROMPT.md` 正文。
- 当前工具没有会话模型切换/核验能力；本记录不声称已经切换或核验为 GPT-6.1 Sol。

**可以进入 M2 的接口设计与实现阶段**：M1 质量基线和兼容回归已具备。
建议 M2 仍从最终已选中的 Pack items 派生摘要，不读取隐藏候选来制造额外结论：

1. 按 source / direct-relation / transitive-path / candidate-test / Git-change 组织证据，
   引用选中项的文件、行号、side/ref；入选理由与关系 resolution 分开。
2. candidate-test 的 `verification.status` 初始只能是 `not-run`。未来若接入实际测试结果，
   必须携带命令、运行身份、退出码与证据位置，不能从 import、命名约定或 exact 推导覆盖。
3. 将 seed-test、imports-seed-file、git-changed-test 的选择依据独立建模，保留现有工具接口；
   摘要字段采用可选、明确版本化的 DTO 扩展，默认文本行为及 5000 字符预算继续兼容。
4. 区分任务摘要截断、预算遗漏、signature-only、索引不完整、源码过期等 gaps，
   同一 text/JSON 计费后再选择摘要，不追加预算外的第二份“完整证据”。

这些仅为接口建议；本轮没有开发 Evidence Summary、Autopilot、Hooks 或新的 MCP 适配层。
