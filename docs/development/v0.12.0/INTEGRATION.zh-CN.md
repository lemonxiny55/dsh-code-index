# v0.12.0 最终集成验收与候选准备

后续状态更新：最后一轮正常 npm 解析和两项真实 Agent 复验已完成，版本本地准备为 0.12.0；最新发布决定见 [RELEASE_READINESS.zh-CN.md](RELEASE_READINESS.zh-CN.md)。下文保留 rc.0 阶段原始结果，不改写历史失败。

日期：2026-11-08（Asia/Shanghai）。分支：`codex/reliable-context-v0.12.0`。
基础提交：M0/M1 `52da07c`，M2 `0afb59b`。本轮没有增加产品功能。

**结论：包级与 Host API 验证通过，暂不建议正式发布。** 三个真实 Agent 任务只有第一项完整成功；
第二项未完成，第三项传输失败。Host API 回放不能替代模型最终回答。
没有推送、PR、合并、Tag 或 npm 发布。root `package.json` 保持 `0.11.2`，
仅隔离打包副本使用 `0.12.0-rc.0`。本轮主体提交：`2df84b2ce1ffebb45e1f3e8a8b4344a7ca1342db`。

## 范围与结果

最小验收结果沿用用户要求：当前代码的实际 tarball 可安装并加载，既有工具返回任务相关源码、
分级静态证据和有界上下文，两个小仓库及 worktree 隔离、外部刷新可用。
没有增加宿主生态排障或覆盖率证明作为验收条件。

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| M0/M1/M2 完整变更审查 | PASS | `f619049..0afb59b` 的 37 文件和本轮 diff；一个最小路由修复见下文 |
| Node 22.23.3 全量 Vitest | PASS | 30 文件，290/290，退出 0 |
| Node 24.19.0 全量 Vitest | PASS | 30 文件，290/290，退出 0 |
| 两版本 typecheck / 服务端 / DTS / 客户端 | PASS | 各入口退出 0 |
| 实际 PowerShell `pnpm build` | PASS | 退出 0；自动补齐已声明的 semver，manifest/lockfile 未变 |
| 六个原始 C3 完整源码树复放 | PASS | 6/6，退出 0，无必需源码缺失或无关 primary |
| ArkTS / Rust / 多语言 / freshness / worktree | PASS | 两版本完整测试、安装包 smoke，Host API 另有小仓库实测 |
| 同一 tarball 两版本干净安装 | PASS（有条件） | npm `--ignore-scripts --no-save --force`；真实 ToolRuntime 各 19 次调用 |
| 常规 npm prerelease peer 自动解析 | 未验证 | --force 绕过 peer 解析，不能据此宣称普通安装解析通过 |
| 官方 DSH 0.2.1-rc.3 Web/Host | PASS | 23 次真实调用，8 工具及 Cordis 加载/卸载/重载 |
| 用户实际 Desktop/Host 0.2.2-rc.1 | PASS（Host API） | Electron Node v24.21.0，22 次调用、8 工具、预算、隔离及刷新 |
| 实际 Desktop 页面及恢复 | PASS（有边界） | 原生页面观察 Context/Evidence 与 X-Ray；稳定插件/API、原字节 profile 均恢复，交互边界见下文 |
| 真实 Agent：中文理解/定位 | PASS | 实际 deepseek-official / deepseek-flash / high，7 调用和完整最终回答 |
| 真实 Agent：影响/候选测试 | FAIL（未完成） | 11 调用，10 成功、1 个宿主 pwsh 权限错误；最终 max-tokens |
| 真实 Agent：0 callers 解释 | BLOCKED | 11 调用成功后 TRANSPORT，最终文本为空 |
| 唯一一次无插件传输隔离 | PASS（隔离请求） | 相同模型回复 RC_OK，退出 0；不把失败任务改记为通过 |

可用工具不提供本 Codex 会话的可验证模型元数据或切换接口，因此不声称已核验为 GPT-6.1 Sol。
DSH Agent 的实际模型路由独立记录，不能与编写代码的会话模型混同。

## 审查与唯一生产代码修复

中文规则使用遮蔽路径后的意图文本，但英文四组正则仍读取原始任务。
文件名因此误触发 change/test，并请求不需要的 Git 上下文。最小修复仅将 TEST / CHANGE /
EXPLORE / ARCH 英文正则输入改为现有 `intent`；保留测试文件提及、真实英文动作、中文和符号规则。
新增测试先在修改前复现失败、修改后通过。隔离对照直接从 `0afb59b:src/context.ts` 构建旧路由，
与实际安装候选的导出函数比较，没有覆盖工作区源码；详见 `integration/router-comparison.json`。

| 输入 | 修改前 kind / change context | 候选实际结果 |
| --- | --- | --- |
| Explain src/change.ts | change / true | ambiguous / false |
| Explain src/current.ts | change / true | ambiguous / false |
| Explain src/failure.ts | change / true | ambiguous / false |
| Explain src/coverage.ts | test / true | ambiguous / false |
| Fix failing tests/config.spec.ts | test / true | test / true |
| Review current changes in src/change.ts | change / true | change / true |

不新增英文 Explain 意图类型；仅消除路径触发的错误分析。其余审查未发现需扩大生产修改的实际回归：
路径组成不作为高置信度符号，明确指定同名标识符仍可查；实现和强证据优先，默认预算、图上界未增加。
exact/import-scoped/name-only 不代表运行时验证，未解析目标不变成确定外部调用。
optional evidence 缺失表示未提供，不等于没有缺口；预算裁剪和解析诊断均有检测条件。

## 六例完整复放

复用此前 C 阶段 execution.json 指向的完整 C3 trials，只读 buildIndex + buildTaskContext，
不是 Agent，也不是缩小 fixture。六条 Git safe.directory 仅用子进程环境传入，未写全局配置。

| 样本 | 路由 | 文本字符 | JSON 字符 | 必需源码缺失 / 无关 primary |
| --- | --- | ---: | ---: | --- |
| T1-C3-r1 | exploration | 6899 | 7996 | 0 / 0 |
| T2-C3-r1 | change | 6861 | 7955 | 0 / 0 |
| T3-C3-r1 | change | 6559 | 7771 | 0 / 0 |
| T1-C3-r2 | exploration | 6899 | 7996 | 0 / 0 |
| T2-C3-r2 | change | 6861 | 7955 | 0 / 0 |
| T3-C3-r2 | change | 6559 | 7771 | 0 / 0 |

这些原始请求预算为 8000，默认仍为 5000。M0 历史修改前 0/6、M1 后 6/6，M2 集成后仍 6/6。
`integration/full-trial-quality.json` 保留每例输入、源码项、召回、噪声、预算、gaps、evidence。

## 实际候选包与安装条件

文件：`integration/dsh-code-index-0.12.0-rc.0.tgz`（本地未发布，Git 默认忽略 tgz）。
SHA-256：`15d2dd53f99cf5450e7ce40065010af15217ba0345ef68cfa9776e797a4c0752`。
24 文件的逐项哈希、npm integrity 和 pack 命令见 `integration/candidate-manifest.json`。

白名单包含服务端 JS/map、DTS、客户端 JS/map、ArkTS grammar/license、说明文档、patch 和脚本。
没有 node_modules、env、实验或无关未跟踪文件。通过 sourcemap 核对 context/context-pack/context-terms/
evidence-summary/change-context/tools 与当前源码，并检查 JS 静态证据标记及 DTS optional 字段。
Node 22/24 smoke 和 Host/Desktop 均用该归档的实际 npm 安装目录，不以旧 npm 包代替。
打包时 HEAD 为 0afb59b，包含本轮尚未提交的路径修复；源码溯源哈希和最终 dist 字节已与主体提交核对。

--force 只用于隔离的 prerelease SDK 消费环境；DSH includePrerelease semver 和实际运行另行断言。
此结果证明安装内容和运行时兼容性，不证明 npm 常规 peer 自动解析。
最早 stage 缺少开发用 semver 导致 smoke 启动失败，补用匹配版本后重跑通过；没有修改依赖声明。

## Host、Desktop、Agent 证据与失败分类

rc.3 Host 使用独立 DSH_HOME 和官方 runProfile；两个小 Git 仓库有不同 marker，另建 worktree，
子进程外部新增/修改/删除后查询。真实 Cordis/ToolRuntime 验证 8→0→8→0 生命周期。
全部原始结果见 `integration/host-results.json`。

真实 Desktop 从安装文件核实为 0.2.2-rc.1，和早期注册表信息不同。
临时本地探针在实际桌面 Host Cordis scope 中卸载目标 fiber，从候选 npm 安装目录挂载；
稳定安装保留。工具数卸载后 0、候选加载后 8，随后 22 调用通过。
入口及包哈希见 `integration/desktop-candidate-load.json`，真实进程、版本、输入、结果和保存的
会话 ID 见 `integration/desktop-results.json`。该会话标注为 Host API 回放，**不是模型请求**。

早期探针错误不计为插件缺陷：实际组合 ID 为 include:code-index，不能直接假设 code-index；
rc.1 execute 使用 calls 批输入，旧单调用参数会在分发前因 calls.map 失败。
只修正验收脚本，没有修改宿主或第三方扩展。最早隔离 Desktop 启动遇到应用自身更新/重启，
不能算隔离桌面通过；随后依用户指令使用真实桌面，单独记录其版本和方法。

真实 Desktop 页面观察到了候选结果中的完整源码、0 callers 限定语、候选测试说明、X-Ray 图和
三档关系控件。Web 页另实际点击 import-scoped 边，检查 src/scoped.js:2 的 namespace 调用源码，
展开不确定性解释。Desktop 关闭前未单独完成这些点击交互的再次复测，不能把 Web 交互算作
Desktop 点击通过。截图在工具会话中展示，未保存独立桌面截图文件；观察记录见
`integration/ui-observation.json`。这些是实际页面观察，不称为自动化 UI 回归套件。

真实 Agent 使用官方 rc.3 headless CLI 及原有模型路由，托管凭据仅在子进程内存传递。
脱敏 stdout 保存真实 tool_call/tool_result/final，stderr 保留失败原因。
第一项正确定位 normalize 并区分关系等级、静态测试预判和未执行测试。
第二项 pwsh 失败来自宿主 SetNamedSecurityInfoW / grantWrite / Win32 5，shell 未成功执行；
本地 maxTokens=2048 上界下最终回答未完成。第三项已取到工具结果，但模型最终说明未完成。
一次无插件隔离成功后停止追加请求，没有修改代理、认证、网络或排查其他扩展。

## 实际输出节选及限制

以下来自 Desktop 小仓库的 5000 预算结果，完整正文见原始 JSON：

```text
Evidence (indexed static scope; unscanned files not assessed):
Index: 7 parsed, 0 partial, 0 failed, 0 unknown.
Selected relationship items: exact 0, import-scoped 0, name-only 0.
Tests: 0 candidate(s), not run; not verified coverage.
0 callers for lonelyMarker (src/idle.js:1): none found in current index/static resolution; not proof of no callers.
Evidence gaps: not-found/no-test-candidates.
```

对应 Pack 字段节选（省略其他字段，并非完整 schema）：

```json
{"evidence":{"scope":"indexed-static-only","basis":"context-pack","index":{"parsed":7,"partial":0,"failed":0,"unknown":0},"relationships":{"exact":0,"import-scoped":0,"name-only":0},"tests":{"candidates":0,"verification":"not-run"}}}
```

诊断仅覆盖已索引文件；parsed 不等于语义完整。0 callers 限于当前索引和静态解析。
未发现、不可用、预算裁剪、索引不完整不能互相替代。300/500 极小预算允许摘要压缩或省略。
这些工具未执行候选测试，也不证明通过或覆盖。回归 fixture 通过不代表用户仓库测试运行过。

## 命令、环境和发布决定

完整参数、cwd、退出码和数量见 integration/test-commands.json、build-commands.json、verification.json。
本次 pnpm shell 命令成功，历史 store 权限阻碍不套用到本轮。初次 spawnSync(pnpm.cmd) 返回
Windows EINVAL，这是启动方式错误；后续实际 PowerShell pnpm build 退出 0，另保留两版本直接入口。
所有通过结论均对应本轮新执行记录；Host 长运行服务的断言通过不伪装成进程正常退出。

候选可以受控复核；**建议补齐两个真实 Agent 的完整结果后再决定正式发布**，不扩大功能范围。
稳定安装未覆盖。候选 scope 已结束，实际 Desktop 新进程验证原插件 7 个默认工具和代码搜索恢复；
最后移除临时探针后，cordis.patch.yml 恢复原始字节，package.json 和认证文件指纹均与开始时一致。
没有对认证文件执行写操作。证据见 `integration/desktop-restored-runtime.json`、`desktop-profile.json`
及 `verification.json`。验收生成的本地会话保留并标注方法，未改写用户已有会话。

主体提交共 69 文件；生产修改仅 src/context.ts，配套 tests/context.spec.ts、release-smoke、
README/中文 README/CHANGELOG、开发报告、验收脚本及原始结果。完整文件清单见
`integration/commit-record.json`。.gitattributes 仅使原始验收日志保持捕获的 CRLF 字节。
最终文档提交 SHA 由交付回复提供。受管工作区收尾时无未提交修改，原有无关未跟踪文件保留；
tarball 作为 Git 忽略的本地产物保留。不读取或修改 HANDOFF_PROMPT.md 内容。
