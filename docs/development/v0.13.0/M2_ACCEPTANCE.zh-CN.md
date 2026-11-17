# v0.13.0 M2：实机体验、真实 Agent 与演示验收

2026-11-17，Asia/Shanghai。版本 **0.13.0-dev.0**；独立 Worktree `D:\ChatGPTProjects\dsh-code-index\.worktrees\v0.13.0`。父提交 M1：`4db3b18e20a53ee159e2921734b0a5280c70f137`。

**判断：核心实现具备进入 RC 收敛阶段的条件。** 这不是正式发布许可，也不表示模型结论全部正确。候选加载、review/text/X-Ray 实际展示、隔离、生命周期取得实证；A/B/C 均取得 text/review 与最终回答。AgentTeam 自动交接继续 **DEFERRED**。不改版本号、不打发布 Tag、不推送、不发布 npm。

## 验收口径与最小修复

先读取 AGENTS.md、v0.13.0 调研、计划及 M1 报告，并审查实现。按有界门禁证明：现有 Desktop 候选可加载；review 返回并展示；旧 text/X-Ray 可显示；不同 Worktree 不串数据；候选卸载后回退稳定工具并可重载。若 TRANSPORT 再现，仅做一次无工具对照后停止；本轮未再出现，故没有无工具请求。没有扩展到宿主或其他插件诊断。

实现复用 Change Context、既有证据等级和源码读取器，无独立图引擎、无测试执行或运行时影响推断。修复两个实际呈现缺口：DTO 的 index/metadata 时间原未出现在最终文本，现在显示 `Index built / metadata observed`；零关系现在直接提示“不证明没有调用者或运行时影响”。扩展元数据断言并增加 1 项零关系测试，总数从 327 到 328。

[回归反证记录](m2-regression.json)：当前 Review 用例对 M1 renderer 为 24/26，恰好元数据展示与零关系边界两项失败；finally 恢复当前源码后为 26/26。恢复后源码指纹与全量测试、已打包构建一致。

Review 显示名称、源码行范围、当前变更符号正文、静态关系、候选测试等级、缺口、root/HEAD/base/dirty 与两种时间。`complete` 仅指所示符号源码范围完整，`omitted.sourceBodies` 只计变更符号；不代表调用者、测试正文、旧源码或 before/after diff 齐备。所有候选测试 **not-run / coverage not verified**，没有伪造覆盖结论。

## Desktop 实机结果

用户现有 **DSH Desktop 0.2.2-rc.3**，Host Node **24.21.0**，既有官方 Inspector。执行与会话准备使用公开 Loader/Agent/Tools/Session API；仅实际界面展开、导航、滚动和截图使用 Computer Use。没有模拟截图。

从普通安装的候选 tarball 挂载实际插件 apply，范围仅为临时 Agent；工具数 **8→7→8→7**，7 是继承的稳定全局工具。候选卸载/重载后查询正常；所有 handle 均释放，全局工具名集合前后相同。未替换全局稳定插件或写入稳定 profile。候选 client 与现有稳定 client 字节相同，因此复用现有注册 renderer 检查兼容性；没有宣称全局候选 bundle 已替换安装。

[脚本](m2-desktop.mjs) / [22 次原生调用](m2-desktop-results.json)：A/B/C × text/review/xray；A→other→A；review 六预算；旧 text 参数；原始 Context Pack 前后相等；卸载重载。最初脚本误传 agent.scope 给 schemas，看到全局视图，按公开声明改传 Agent 本体后通过；finally 均释放。这是验收脚本错误，不计插件失败或通过调用。

真实 UI 观察：展开完成步骤和工具结果可读 Review 当前源码、调用者及测试等级；内部滚动可读缺口和预算。旧 text 的调用者、依赖、路径、候选测试可显示。X-Ray 绘制中文卡片，放大视图正常；点击 checkout→calculateTotal 边后出现真实 import 和调用行。不同 Worktree 的 root、变更与源码独立；other 只出现 OTHER_REPO_ONLY，切回 A 无此标记。

截图与来源见 [素材说明](../../assets/v0.13.0/README.md)。全部是实际 Host 工具结果经 Session API 持久化后的 **Host API replay / no model call** 会话，不当作真实 Agent 成功截图。Review 复用旧文本卡片，长内容需滚动；没有专用富卡片，也没有宣称纯文本源码路径点击已验收。

## 真实 Agent：三个任务完成，保留一次未完成

沿用现有 `deepseek-official / deepseek-flash / high` 路由，仅在 Agent 作用域开放候选 code_change_context。合成夹具只读，不运行/编译示例、不修改示例。公开日志保留实际 tool/call、tool/result、turn/end 与最终文本，不公开模型 reasoning/stream 块。[脚本](m2-agent.mjs)。

| 任务 | 结果 | 实际工具调用 |
|---|---|---:|
| A：calculateTotal 修改与调用者 | text/review 均有，completed；另补 xray 和调用者文件查询 | 4 |
| B：PricePolicy 公共接口，首次 4096 上限 | max-tokens，无最终回答，**未通过** | 2 |
| B：一次 8192 上限重试 | text/review 均有，completed；补深度/整文件/xray 探测 | 5 |
| C：experimentalLabel 无确定调用者 | 最终默认 Git 选择 text/review 均有，completed；先有 5 次无效符号 ID 选择 | 7 |

原始证据：[A](m2-agent-A-results.json)、[B 未完成](m2-agent-B-max-tokens-results.json)、[B 重试](m2-agent-B-results.json)、[C](m2-agent-C-results.json)。4 次模型运行共 18 次工具调用；正常结束的 A/B/C 共 16 次调用。全部工具返回无 isError，**不等于选择有效或模型结论正确**。历史 M1 TRANSPORT 不改写成通过。

手工审阅发现并保留的错误/限制：

1. C 猜测短名和 file::name，B 也猜了 PricePolicy，均不符合 symbols 接受 SymbolInfo.id 的契约。实际 ID 以 `sym:v1:` 开头（src/extract.ts），应来自 code_symbols。警告正确；C 将查询未命中归因“工具解析问题”是 Agent 错误。教程采用默认 Git diff 并解释参数，没有加入模糊匹配。
2. A 说 xray 没有新证据：canonical 模型文本确实与 text 相同，但 Desktop metadata 有图和源码，不能据此判断 UI 没信息。
3. B 将聚合 DIRECT CALLERS 中 checkout 自身的源码位置误读成 checkout 自调用。该条实际描述 checkout 在该位置调用被选中的 calculateTotal，不能据模型误读报自环缺陷。
4. A 没有取得旧函数体，却断言整数调用“不可能区分修改前后”，超出其当时前后对比证据。夹具旧版本可确认本次基线是乘法，但 Agent 当时并未获取，不将此推论计为审阅通过。
5. A/B 均发现旧源码、diff hunk、调用者/测试正文不足。B 正确拒绝“接口迁移安全”；C 最终正确说零关系不证明无运行时用户。测试中匿名 callback 未形成顶层 SymbolInfo，不代表文件未扫描或没有测试正文。
6. 调用传播与模块导入是不同分析口径，TRANSITIVE IMPACT 为空不表示没有二跳 import；关系计数不含候选测试，不能混加。整文件选择是调用者指定的假设变更，不等于真实 Git 修改。

Agent 层结论为 **完成对照，存在已记录的推论错误和补充查询成本**，不是“3/3 全语义正确”，也不是单次查询保证任务完整。

## 输出质量与回归

[核对脚本](m2-audit.mjs) / [结果](m2-output-audit.json) 验证磁盘源码逐行一致、canonical rendering、预算、证据等级和隔离；不自动给模型最终结论打正确分。

| 案例 | text 字符 | review 整体 JSON / 5000 | 变更 / 静态关系 / 候选测试 |
|---|---:|---:|---|
| A | 1170 | 3198 | 1 / 3 / 1；测试 import-scoped |
| B | 879 | 2238 | 1 / 1 / 1；测试 name-only/path-convention |
| C | 803 | 2090 | 1 / 0 / 0；明确证据不足 |

各例 1 个当前变更源码体，逐行等于磁盘，均无预算导致的变更/关系/测试省略。Review 比 text 包含更多数据，不能据字数声称 token 节省。小夹具观察不推广为大仓库指标。

| 环境 | 全量测试 | typecheck | server/client 构建 | rc.3 tarball smoke |
|---|---|---|---|---|
| Node 22.23.3 | 328/328，33 文件 | 退出 0 | 退出 0 | 25 次原生 batch 通过 |
| Node 24.19.0 | 328/328，33 文件 | 退出 0 | 退出 0 | 25 次原生 batch 通过 |

完整 DTS 为 32988 bytes，两版安装包类型 consumer 也退出 0。空 consumer 的 **普通 npm install** 两版通过，无 force/legacy-peer-deps/ignore-scripts；保留 prepare allow-scripts 待批准警告，未绕过，dist 可直接加载。另行 release-smoke 沿用其 `--ignore-scripts` 安装路径并正常解析 peer，和普通安装分开记录。Node22 还跑通实际安装包内的示例生成器。

release-smoke 的真实脚本缺陷已最小修复：rc.3 使用 batch 且显式连接官方 NativeToolExecutor；原先旧单调用方式导致 TOOL_EXECUTOR_UNAVAILABLE。仅异步挂载执行器未及时激活的尝试也失败，改为公开 setExecutor 连接后通过。没有改 DSH 宿主。为旧调用协议保留版本分支，用同一归档额外验收 0.2.1-rc.3 的 25 次调用通过。实际安装的 review 六预算断言作为回归，不增加镜像实现 mock。

证据：[Node22 测试](m2-tests-node22.json)、[Node24 测试](m2-tests-node24.json)、[Node22 rc.3 smoke](m2-smoke-node22.json)、[Node24 rc.3 smoke](m2-smoke-node24.json)、[旧 runtime smoke](m2-smoke-old-runtime.json)。原始 Context Pack 六个真实输入回归、旧参数/text/xray 测试继续通过。

最终 tarball：`node_modules/.m2-package-verified/dsh-code-index-0.13.0-dev.0.tgz`；SHA256 `f92fafb669d247ed55257e5f4887b0b5a7f2c0d871f2ddcd354e9cfe09854fdf`。Desktop 使用较早的 M2 普通安装副本，最终包与其 server/client/DTS 字节一致，包差异为 smoke 脚本修正。没有用旧 M1 产物证明本轮修复。

## 交付与 RC 范围

新增 [离线示例生成器](../../../scripts/create-review-demo.mjs)、[中文教程](DEMO.zh-CN.md)、[英文教程](DEMO.en.md)、[双语宣传草稿](PROMOTION.md) 和新版实机 JPEG。交付真实截图与口播步骤，没有声称已录制视频；没有恢复旧 GIF/MP4，没有清理原工作区文档改动，未读取或修改交接提示文件。

建议 RC 范围：可选 review 输出、受预算约束的当前变更源码与静态证据等级、测试 not-run、缺口和版本时间、text/xray/pack 兼容、可复现教程。下一阶段收集真实项目反馈并收敛审阅措辞。

继续暂缓：专用富 Review UI、自动拼接全部调用者/测试/前后 diff、完整类型依赖图、传递 import 语义增强、大仓库效率承诺、AgentTeam 自动交接。本轮没有已发现但未修复的插件阻塞缺陷；参数误用、模型推论误读和输出上限失败必须作为已知限制保留，不能从宣传中抹去。
