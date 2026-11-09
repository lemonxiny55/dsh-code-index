# v0.12.0 最后一轮发布阻断检查

2026-11-08，发布准备分支 `codex/v0.12.0-release-ready`。原目录保留 `codex/reliable-context-v0.12.0`，避免影响链接该目录的稳定安装。本轮只做剩余阻断检查及发布元数据准备，未增加产品功能，未重复已通过的完整测试或构建。

**结论：RELEASE READY（就插件包级发布阻断而言）。** 已发现的 npm peer 安装阻断已修复，两个未完成的真实 Agent 任务已在有限复验中完整结束。npm/GitHub 发布仍须最终确认，本轮没有 push、PR、Tag、npm publish 或 GitHub Release。

## 真正的阻断及修复

rc.0 原声明 `@deepseek-ai/dsh-tools >=0.2.0-rc.2` 在 npm 默认 semver 下不会纳入不同版本 tuple 的预发布版本。

| 检查 | rc.0 实测 | 最终 0.12.0 实测 |
| --- | --- | --- |
| 干净项目直接安装归档、让 npm 自动解析 peer | 退出 0，但选旧 SDK 0.2.0-rc.2 | 退出 0，SDK 0.2.2-rc.1 / Cordis 4.1.0 |
| 干净项目同时指定 SDK 0.2.2-rc.1 | 退出 1，ERESOLVE，冲突直接指向本插件 peer 范围 | 退出 0，SDK 0.2.2-rc.1 / Cordis 4.1.0 |
| 默认 npm semver 的针对性回归 | 3/6 通过，3 失败 | 6/6 通过 |

最小修复：`>=0.2.0-rc.2 || >=0.2.1-rc.2 <0.2.2 || >=0.2.2-rc.1 <0.2.3`。
保留既有稳定版本范围、DSH includePrerelease 行为，补上已验证 RC 版本组的普通 npm 解析。
未将未知未来 prerelease tuple 自动加入 npm 可解析范围，也不声称未来 Host 已验证。
发布 smoke 去掉 --force，并增加默认 semver 断言；没有修改生产 TypeScript。

实际环境：Windows、Node 24.19.0、npm 11.17.0。每次是新项目、新 node_modules 和新 lockfile；
用户/global npmrc 指向空的临时文件，清除继承的 npm_config 设置。没有 --force、--legacy-peer-deps、
--ignore-scripts。复测只复用已下载的内容缓存加速，不复用依赖树或 lockfile。
npm 11 提示 prepare 脚本待批准；未批准或绕过该策略，已打包 dist 仍可直接加载。
不能把这一环境结果扩展成任意 npm/Host 版本均已验证。

原始命令、退出码、解析版本和日志：`release-blockers/rc0-npm.json`、`release-npm.json` 与同名前缀日志。
新增 TypeScript 测试后只运行该 6 项 peer 回归和 typecheck（退出 0）。正常安装的新 SDK/Cordis 组合另做
8 工具注册、2 次公开共享管线调用（Context Pack 与 refs）和 0 工具残留的卸载检查，全部通过。
这不是再次运行整套 Host/Desktop 验收。

## 两项真实 Agent 有限复验

只读此前相同小仓库、同一 rc.0 已安装代码（应用 JS 与最终包字节一致），官方 rc.3 headless CLI，
原有 deepseek-official / deepseek-flash / high。每项只请求一次，模型自动重试为 0。
临时 maxTokens 从 2048 提到 8192，关闭该临时 profile 的 repo-map 自动注入并要求只调用相关代码工具；
不修改用户默认设置或权限，不调用 shell。本轮没有 TRANSPORT，因而没有追加隔离请求。

| 任务 | 工具调用 | 工具错误 | 最终结果 | 退出码 |
| --- | ---: | ---: | --- | ---: |
| 修改影响及候选测试 | 1（code_change_context） | 0 | completed；指出 normalize 影响和候选 tests/core.test.js，明确未执行/覆盖未验证 | 0 |
| 无静态调用者 | 2（code_refs、code_context） | 0 | completed；定位 lonelyMarker，明确当前索引/静态范围、动态路径不能排除 | 0 |

真实 tool_call/tool_result/final 和 stderr 保存在 `release-blockers/agent-impact/`、`agent-zero-callers/`。
结果摘要见 `agent-recheck.json`；不是合成回放，也不是 Host API 冒充模型回答。

历史失败的分类不改写：2048 token 导致 max-tokens 属于当时请求上限；pwsh 的 SetNamedSecurityInfoW /
grantWrite / Win32 5 属于宿主 shell 权限；TRANSPORT 属于模型传输失败，发生在成功工具结果之后。
对插件发布而言，这些可以作为已记录的外部限制接受，因为失败未发生在 code_* 工具体，输出正确，
且本轮相同任务完成了最终回答。若日后只有工具成功、最终回答失败，仍必须将 Agent 项标记未完成，
不能因接受外部限制而伪报整条 Agent 链通过。本轮没有修复或承诺宿主 shell、代理、模型网络的可靠性。

## 包、提交和稳定安装

独立发布工作树的 package 已本地更新为 0.12.0，尚未发布。原项目目录的稳定安装通过 link 指向工作区，因此该目录恢复并保留原有 0.11.2 manifest；应用 dist 不变。旧 rc.0 不覆盖，保留作历史对照。
最终待确认归档：`release-blockers/dsh-code-index-0.12.0.tgz`，24 文件。
SHA-256：`318d91bdd82d75b683fe1d1f9635f45169b059248fefdc246d1d2f088bb1296b`。
完整 npm integrity、文件哈希及 pack 命令见 `release-artifact.json`；提交绑定见 `artifact-commit.json`。

发布载荷提交：`a371481c4aef07b5ecdb4484ebf85eb69d621dd4`。绑定检查核对 19 个包内 Git 文件和 28 个 sourcemap 源项；构建产物逐字节核对。后续收尾提交只增加绑定证据及文档/验证脚本，不改变归档。
独立工作树：`D:\ChatGPTProjects\dsh-code-index\node_modules\.v012-release-ready`。
原目录 `D:\ChatGPTProjects\dsh-code-index` 仍在 `69981b5`、版本 0.11.2，稳定链接安装不随发布准备升版。

本轮源码与 dist（含 DTS、客户端、sourcemap）和原已验证 rc.0 逐字节一致，因此沿用此前 Node 22/24
全量各 290/290、构建、六例完整复放、rc.3 Host 和真实 Desktop 0.2.2-rc.1 的结果；没有虚报重新执行。
新增 6 项 peer 测试单独记录，不能写成“本轮全量 296 项已运行”。
包内元数据、README/CHANGELOG 和 smoke 更新单独核对 Git 提交（文本允许 Git 换行规范化，二进制/dist 严格核对哈希）。没有覆盖现有稳定安装。
Desktop package.json、cordis.patch.yml、认证文件指纹不变；本轮不控制桌面，不写认证/代理配置，
不读取或修改 HANDOFF_PROMPT.md，不删除或覆盖无关未跟踪文件。

## 可接受的已知限制

- exact/import-scoped/name-only 均是静态等级；0 callers 不证明运行时无人调用。
- parsed 不保证语义完整；未扫描、解析失败、未解析关系仍有明确边界。
- 测试候选未被工具执行，不代表覆盖验证；预算下 optional evidence 可缩减或缺失。
- 真实 Agent 仅验证指定的少量任务及临时 token/工具约束，不保证任意长任务或网络可靠。
- 真实 Desktop 本轮不重跑；此前 Desktop 图/文本渲染和 Host API 已通过，边点击额外交互只在 Web 实测。
- 后续 npm/DSH 版本需另行验证；发布声明不等同于所有未来版本已验收。

这些不构成当前已知插件级阻断。此前的“建议暂缓”是历史阶段结论，由本记录更新。

## 最短发布步骤（全部等待最终确认）

1. 审阅本地版本提交、[英文](RELEASE_NOTES.md)/[中文](RELEASE_NOTES.zh-CN.md)说明及 [PR 草稿](PR_DRAFT.md)。按团队流程合并/推送后，确认发布提交的包内容与归档绑定一致。
2. 在选定发布提交打 `v0.12.0` Tag 并推送；本轮不执行。
3. 校验上述归档 SHA-256，再执行 `npm publish docs/development/v0.12.0/release-blockers/dsh-code-index-0.12.0.tgz --access public`。
4. 从同一 Tag 发布 GitHub Release，使用双语 Release Notes。不要把尚未执行的发布后安装回查算作通过。
