# v0.9.0 showcase follow-up / 展示推广记录

Date / 日期: 2026-10-08. Scope: documentation, real-record demo and catalog description only. No plugin feature changes, npm publication, Release edits, benchmarks, or unrelated public posts.

本轮仅更新文档、真实记录演示和目录介绍；未开发新功能、发布 npm、修改 Release、制造 benchmark 或进行其他公开发布。

## Discussion / 官方仓库讨论回复

Published one EN/中文 update in the existing [Discussion #5623](https://github.com/deepseek-ai/deepseek-harness/discussions/5623#discussioncomment-18808930), with install commands, Release/evidence links, the 42-second GIF and an invitation to report real tasks. No duplicate discussion was created. Verified by reading the published reply through the browser and GitHub GraphQL API.

已在原帖发布一条中英文更新，附安装命令、Release、验证记录和演示，并邀请真实使用反馈。未创建重复帖子；使用浏览器和 GitHub GraphQL API 回读公开回复。

## Catalog audit / 插件目录检查

| Directory / 目录 | Observed / 观察结果 | Action / 处理 |
| --- | --- | --- |
| [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | Existing YAML entry still emphasizes the older symbol/map/tool surface. / 已收录，双语介绍仍以旧工具表面为主。 | [PR #6860](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6860) updates only the existing EN/zh description for v0.9.0. / 仅更新已有条目中英描述，等待维护者审核。 |
| [bruc3van/awesome-dsh-plugin](https://github.com/bruc3van/awesome-dsh-plugin/blob/main/catalog/agents-workflows.md) | Already listed with task-aware source packs, relations, changes, tests and hard budgets. / 已收录，简介已涵盖核心能力。 | No redundant PR. Its CONTRIBUTING.md forbids hand edits to generated catalog/snapshot files. Automatic upstream refresh is the update path. Self-showcase requires more than 10 stars; no attempt to bypass it. / 不提交重复 PR，不修改自动生成文件，不绕过自荐门槛。 |
| [DSH Plugin Hub](https://dshpluginhub.ai/plugins/dsh-code-index) | Search cache showed 0.8.0; **live browser page already shows 0.9.0**, updated 2026-10-08, and current README. Top EN/中文 summary is still old; DSH compatibility displays `*`; install currently selects a pinned GitHub source. / 实时页面已同步 0.9.0 与新版 README，但顶部摘要旧、兼容栏宽泛，默认安装为固定 GitHub 提交。 | No public catalog-data PR interface found. Use [owner claim/manage](https://dshpluginhub.ai/dashboard/publish/github?repository=lemonxiny55%2Fdsh-code-index&slug=dsh-code-index) after sign-in, or its [report form](https://dshpluginhub.ai/report?package=dsh-code-index). Record the matching 0.2.0-rc.2 runtime and npm command below; no account claim or profile publication performed. / 记录登录认领管理及报告入口，未认领账号或发布 Profile。 |
| [dshbase](https://dshbase.com/plugins/dsh-code-index/) | Public page has stale early README and says not published on npm, with old 0.1.0-rc.6 test information. / 公开页面仍是早期内容，错误标注未发布 npm，验证记录属于旧宿主。 | [Contact page](https://dshbase.com/contact/) directs factual corrections to email with repo URL. No community data PR route found. Ready-to-use correction copy below; no unsolicited email sent. / 仅支持联系维护者纠正，交付可直接发送的双语文案，未发送邮件。 |
| [DSH Hub (dsh-hub.org)](https://dsh-hub.org/) | No dsh-code-index match in the public 317-plugin snapshot checked. / 检查的公开 317 插件快照未找到该条目。 | Site offers “Submit repository” and `hello@dsh-hub.org` for snapshot corrections, not a public data-repo PR. Record route only. / 记录网站提交与联系入口，不另行公开提交。 |
| [dshmp](https://dshmp.com/en/plugins/dsh-code-index) / [DSHPlugin.app](https://dshplugin.app/) | dshmp search cache has a 0.5.0 listing; direct detail requests for these sites failed. / 搜索缓存显示 dshmp 旧条目，实时详情请求失败。 | Current state unconfirmed; do not treat cached version as live or submit duplicates. DSHPlugin.app's public [directory repository](https://github.com/dshplugin-app/deepseek-harness-plugins) points to its website submission route. / 状态未确认，不重复提交；记录网站入口。 |

Catalog PR validation / 目录 PR 检查: followed `CONTRIBUTING.md`; `validateEntries(readEntries())` checked 4424 entries with zero problems; `node scripts/generate-readme.mjs` succeeded. Generated files excluded from the PR. GitHub `check` and `Submission gate` both completed successfully; PR is open, not merged. npm mapping is automatic; no unsupported install/version fields added. The connector could write the fork branch but creating an upstream PR returned 403, so the signed-in browser submitted it successfully. CLI works under the desktop user; sandbox-account authentication errors were not treated as plugin defects.

遵守贡献规范，仅修改自身 YAML 条目；已通过条目校验和生成检查，不提交生成文件、不改其他插件。连接器创建上游 PR 权限不足，已通过登录浏览器完成提交。沙箱账号的认证问题未作为插件缺陷排查。

## Ready-to-use catalog correction / 可直接使用的目录修正文案

**EN:** dsh-code-index v0.9.0 is published on npm. One `code_context` call returns key source excerpts with accurate line ranges, inclusion reasons, relationship provenance, Git changes and likely tests within a hard character budget. Local repo/worktree indexes remain isolated and refresh after external edits. The text/pack workflow was verified with a real DSH Desktop 0.2.0-rc.2 Agent. Likely tests are leads, not coverage proof. Please refresh the description/version and show the matching host requirement; old-host checks do not prove v0.9 compatibility.

**中文：** dsh-code-index v0.9.0 已发布 npm。一次 `code_context` 在严格字符预算内返回关键源码、准确行号、入选理由、关系来源、Git 变更和相关测试线索。本地 repo/worktree 索引隔离，外部编辑后自动刷新。文本/pack 工作流已通过真实 DSH Desktop 0.2.0-rc.2 Agent 验证，测试线索不等于覆盖率证明。请刷新简介与版本，并展示匹配的宿主要求；旧宿主验证不能代替 v0.9 的兼容证据。

```sh
npx @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add dsh-code-index@0.9.0
npx @deepseek-ai/dsh@0.2.0-rc.2 web
```

[Release](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.9.0) · [Demo / 演示](assets/agent-context-demo.gif) · [Evidence / 验证](RELEASE_EVIDENCE_v0.9.0.md)

## Demo and README / 演示与文档

Delivered a 42-second 1280×900 GIF (373699 bytes), PNG preview, asciinema-compatible cast and provenance manifest. [Demo notes](assets/agent-context-demo.md) explain the source records and editorial pacing in both languages. It is a replay of actual Desktop Agent records from 2026-10-05, **not a newly recorded desktop interaction**. No native desktop capture API is exposed in this session. No fix/test success or speedup is claimed.

交付 42 秒 GIF、PNG、cast 和来源清单，使用 10 月 5 日真实 Desktop Agent 记录，**不是本轮新录制的桌面交互**。中英字幕及说明明确标注来源、剪辑节奏和验证边界。README 两种语言嵌入同一 GIF，增加可试用的任务与反馈入口，并把安装章节的宿主及插件版本固定到已验证组合。

Verification / 本轮检查: all seven panels visually inspected; GIF decoded to verify 42-second duration; source evidence SHA256 matched; selected recorded character counts checked; local README asset links checked; final whitespace checks run. These are artifact/document checks, not a rerun of the release gate. `HANDOFF_PROMPT.md` remains untracked and untouched.

Outstanding / 剩余: upstream catalog PR review and site-owner catalog edits; optional new desktop screen capture unavailable. This round does not claim new Stars, downloads or user feedback.

待办仅为目录 PR 的外部审核、站点维护者的信息修正，以及环境未支持的新桌面录屏。本轮不宣称获得了新增 Stars、下载量或用户反馈。
