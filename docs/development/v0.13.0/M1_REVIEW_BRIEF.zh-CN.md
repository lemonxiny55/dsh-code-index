# v0.13.0 M1：Review Brief 工具接入

日期：2026-11-17（Asia/Shanghai）。开发版本：`0.13.0-dev.0`，未发布。本记录接续 [M0](M0_COMPATIBILITY.zh-CN.md)，不改写其中历史验收和暂停事实。

最终接续分支：`codex/review-ready-context-v0.13.0-m1`；worktree：`D:\ChatGPTProjects\dsh-code-index\.worktrees\v0.13.0`。原开发树保留。为避免稳定工作区显示该容器目录，仅在本地Git exclude增加了`/.worktrees/`，未修改原分支的跟踪文件或用户既有改动。

## 本阶段结果

已将 Review Brief 接入现有 `code_change_context` 的可选 `review` 输出。新增一个展示模块，没有新图引擎、任务路由、候选测试执行器或 AgentTeam 自动交接。默认 text、xray 和原始 Context Pack 的既有行为保留。

候选包已通过 typecheck、完整回归、服务端/DTS/客户端构建、普通 npm 安装、rc.3 原生工具管线，以及现有 Desktop 的候选工具直接调用。**真实 Desktop Agent 尚未通过**：候选请求及唯一一次无候选/无工具检查，都在工具调用前返回 `TRANSPORT`。目标卡片最终绘制与交互也不在本轮已验证范围内。

## 使用与契约

在此开发分支构建的候选包中，让 Agent 或 Host API 调用：

```json
{"repoRoot":"D:/absolute/path/to/repo","outputFormat":"review","budgetChars":5000}
```

工具仍是 `code_change_context`；省略 `outputFormat` 时仍返回原文本，`xray` 仍返回既有 X-Ray 快照。`budgetChars` 仅作用于 review，默认5000，有限数值取整并限制在300～20000；非有限值回到5000。该接口尚不在公开 npm 0.12.0 中。

返回 `{ text, brief }`：

- `brief.version = 1`，`scope = indexed-static-only`，`verification = not-run`。
- 正常 `status = bounded`；包含 `repository`、`summary`、`changes`、`relations`、`tests`、`warnings`、`omitted`、`gaps`、`budget`。这是预算内选择，不是完整审阅结论。
- 极小预算无法容纳必要元信息时，`status = omitted`；明确说明全部证据和仓库元信息未提供。缺失的数组/计数不能解释为没有变更、没有影响或没有测试。
- `budget.usedChars` 精确等于 `JSON.stringify({text, brief}).length`。它计入重复文本、DTO、元信息和计数字段；不是字节数、模型token数，也不包含宿主另外包裹的 ToolResult、工具schema或网络协议开销。
- 沿用原来的 diff/files/symbols/Git 选择规则及分析上限；同一个 `ChangeContextResult` 直接派生展示，不二次路由或重建关系图。

### 证据内容

`changes` 包含变更类型、符号名称、文件、整行源码起止、current/base、ref、complete/window/signature 模式。删除侧使用分析已解析的不可变base commit；即使HEAD后来移动，也不读新的HEAD代替原基线。源码不可用或位置失效时只返回明确标记的签名；源码超出摘录/输出预算与源码不可用分别标记。不会为适应预算切断源码行。

`relations` 包含既有直接调用者、传递影响及import dependents。调用行的 `resolution` 是上游的整条路径等级，`via.resolution` 是最后一跳；两者分开保留，不能把最后一跳exact升级为整条路径exact。Review不展开入口路径，存在路径时明确给出缺口，并建议使用xray复核完整路径。

`tests` 保留既有候选及选择理由，整体始终not-run；import、名称惯例、changed-test或exact均不能推出执行成功或覆盖验证。工具调用不会运行候选仓库的测试。

`summary` 的数量指**上游有界分析结果**。`omitted` 是从这些结果中未进入Brief的changes/relations/tests/warnings数量；`sourceBodies`指未携带任何code的变更行数，包含完全省略和signature-only，不是完整函数体覆盖计数。window虽有code，仍会标记source-window。

`gaps`保留上游缺口code，并补充解析诊断、未知解析状态、未映射变更、上游截断、展示上限、源码降级、预算省略及版本信息不可得。必要的缺口code优先于长warning详情；后者放不下时仍计入omitted.warnings。预算不足以保留这些必要元信息时整体降级为omitted，避免裁掉缺口后留下“完整证据”的错觉。

### 选择顺序和上限

在可容纳必要元信息的前提下，先尝试预留一条候选测试和一条静态关系，再选择变更源码，之后交替补充关系/测试，最后放warning详情。特别长的第一条记录也可能放不下；省略始终有计数，预留不是每种预算下的完整性保证。

展示上限：24个变更、40条关系、20个候选测试、12条warning；不放大既有分析的深度和关系上限。超过展示上限明确标记projection-row-cap。这些是展示边界，不是对实际变更规模的断言。

### 仓库版本边界

`repository`记录真实worktree root、HEAD/base、dirty状态、索引生成时间与Git元信息采集时间。无Git、未出生HEAD或命令失败保持null/unknown，不把父目录的Git身份借给普通子目录。dirty忽略本地`.dsh-code-index`缓存；Git调用采用argv数组、单次3秒超时和有限输出，不执行shell拼接。

显式inline diff不额外采集Git元信息，因此head/dirty为null并标记未采集。显式baseRef需要的既有Git基线读取仍保留；修正了原工具描述中“所有inline diff都不运行Git”的过度概括，未改变既有分析行为。

**这些是非原子观察，不是仓库内容指纹或安全交接凭证。** dirty同为true并不表示内容相同，HEAD相同不表示工作区相同。源码读取沿用mtime/大小和路径边界检查，不能防住保留相同mtime的所有并发改写。修改后应重新查询。自动AgentTeam交接继续DEFERRED。

## 验证方法

### 源码和回归

新增正式Review契约测试覆盖默认工具路径、真实SDK输出/参数校验、HEAD/dirty、删除基线冻结、源码位置和预算降级、弱路径等级、缺口保留、拥挤变更的关系/测试预留、完整envelope预算、worktree会话隔离和raw Context Pack不变。

既有302项（包括第一阶段6项内部原型测试）继续保留；正式Review新增25项，总计327项。最终退出码、数量、构建产物/归档指纹见 [M1验证摘要](m1-verification.json)。没有把重复运行视作额外独立任务。类型检查使用项目已声明开发依赖；rc.3管线另用正常安装的实际tarball验证。

最终包另有[真实TypeScript consumer检查](m1-consumer-check.ts)：从安装包导入函数、DTO和参数，检查状态收窄，并要求非法验证状态/输出格式产生类型错误。第三方声明使用skipLibCheck，但通过非any断言及ts-expect-error防止本插件类型静默退化为any。

发现并处理的构建环境问题：原worktree位于node_modules内，声明打包器把本地模块视为外部，虽退出0，却留下指向不存在声明文件的相对re-export。已发布0.12.0的DTS是完整的，这不是旧发布包缺陷。Windows拒绝目录移动后，不继续查锁；在非node_modules路径创建接续worktree并逐文件校验复制。正常构建恢复为约32KB完整声明，再重新打包、普通安装和消费编译。未修改构建器或依赖。不能把此前约3KB声明的早期归档当作最终可交付包。

另一次测试仅在afterEach清理临时目录时遇到Windows EBUSY；采用与已有Git夹具相同的有界删除重试后重新跑完整测试，断言没有放宽。

### 安装包和 rc.3 原生管线

候选归档保存在独立worktree的`node_modules/.m1-package-final/`。从空consumer目录普通安装它及`dsh-tools`、`dsh-system-prompt`、`dsh-tool-executor-native`的0.2.2-rc.3，Cordis实际解析为4.1.0；不使用force、legacy-peer-deps或ignore-scripts安装。npm的prepare待批准警告保留，未绕过；已构建dist实际可加载。

16次真实原生管线调用：六档完整预算、默认档源码/直接调用者/候选测试/dirty、text/X-Ray值及metadata保持、原始Context Pack保持、A/B/A与linked worktree隔离、8→0→8→0卸载重载。见 [门禁脚本](m1-runtime-gate.mjs) 与 [结果](m1-runtime-results.json)。这是SDK/runtime检查，不是高级JSON-RPC SDK客户端或最终Desktop UI测试。

最终小夹具的默认Review为3202/5000字符，选入1个变更、4条静态关系和1个候选测试；这些上游行及源码没有被省略。入口路径未展开、非原子快照仍明确列为缺口。这是单个合成任务的体积观察，不是大仓库质量或耗时收益结论。

### 用户现有 Desktop

按照用户要求使用现有Desktop及其已启用的官方Inspector，没有新建或改写profile，不使用Computer Use。通过观察到的Host Context，使用Loader公开import API导入安装候选模块，短暂注册唯一验收别名，调用review的5000/300预算后立即移除。原有7个工具名称前后相同，稳定插件没有被替换，候选的apply/settings/autoInject没有挂载到全局环境。

初次使用CDP函数中的动态import，因该执行realm没有import callback而失败，发生在目标工具执行前。一次最小修正改用公开`loader.import`后通过；没有修改宿主或继续调查内部框架。见 [Desktop脚本](m1-desktop-candidate.mjs) 与 [直接调用结果](m1-desktop-results.json)。

这里证明了现有Desktop的真实Host工具管线能处理候选Review的值和canonical text；**没有宣称最终卡片绘制、放大或源码点击已完成UI验收**。

### 真实 Desktop Agent：未通过，停止排查

在现有Desktop创建一次仅开放候选code_change_context的Agent，使用已有deepseek-official / deepseek-flash / high路由、4096输出token上限和合成仓库；候选工具仅在该Agent作用域覆盖同名工具，不改变全局注册。

结果为工具调用前`TRANSPORT`，0次tool/call，没有最终回答。随后仅做一次无候选模块、无可用工具、只要求短文本回复的同Desktop检查，同样TRANSPORT、0次调用。两次Agent均结束并释放作用域，globalToolsUnchanged为true。

因此归类为当前宿主/模型传输层兼容限制，**不证明Review工具失败，也不能写成真实Agent通过**。遵守一次最小检查后的停止条件，不排查账号、网络、其他插件或宿主实现。原始结果：[候选Agent](m1-desktop-agent-results.json)、[无工具检查](m1-desktop-isolation-results.json)。这些请求发生在最终源码位置缺口标签补充前，且目标工具均未执行；最终候选本轮不追加模型请求。

## 后续边界

本阶段只完成Review Brief工具接入及可完成的验证，不等于发布就绪。下一轮在传输恢复后进行一次真实Agent复验，并核查目标文本/卡片最终展示；不需要重做已通过的全部检查，除非源代码或环境变化使其失效。高级SDK客户端和AgentTeam安全交接仍需独立设计/验收。

不推送、不创建PR、不发布npm，不修改原工作区已有文档与媒体删除，不读取`HANDOFF_PROMPT.md`。稳定Desktop的manifest、patch与认证文件指纹核对在[m1-verification.json](m1-verification.json)中单独记录。
