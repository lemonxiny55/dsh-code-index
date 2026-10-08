# v0.9.0 showcase follow-up / 展示推广记录

Date / 日期: 2026-10-08. Scope: documentation, real-record demo and catalog description only. No plugin feature changes, npm publication, Release edits, benchmarks, or unrelated public posts.

本轮仅更新文档、真实记录演示和目录介绍；未开发新功能、发布 npm、修改 Release、制造 benchmark 或进行其他公开发布。

## Discussion / 官方仓库讨论回复

Published one EN/中文 update in the existing [Discussion #5623](https://github.com/deepseek-ai/deepseek-harness/discussions/5623#discussioncomment-18808930), with install commands, Release/evidence links, the 42-second GIF and an invitation to report real tasks. No duplicate discussion was created. Verified by reading the published reply through the browser and GitHub GraphQL API.

已在原帖发布一条中英文更新，附安装命令、Release、验证记录和演示，并邀请真实使用反馈。未创建重复帖子；使用浏览器和 GitHub GraphQL API 回读公开回复。

After recording the real desktop interaction, updated this same comment (`DC_kwDOT3T1g84BHwBi`) in place. API readback matched the bilingual replacement exactly; the GIF's published Git blob SHA matched the local asset. The new footage/notes are pinned to commit `f1ea40ce2dcafeb2c320455ec010ec8532bad0cc`. No additional reply was posted; inline browser rendering was not rechecked.

新桌面录屏完成后，就地更新同一条回复。API 回读与双语替换文案完全一致，公开 GIF 的 Git blob SHA 与本地一致；素材和说明固定引用 `f1ea40c`。没有再发回复，未重复检查浏览器内嵌渲染。

## Catalog audit / 插件目录检查

| Directory / 目录 | Observed / 观察结果 | Action / 处理 |
| --- | --- | --- |
| [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) | Existing YAML entry still emphasizes the older symbol/map/tool surface. / 已收录，双语介绍仍以旧工具表面为主。 | [PR #6860](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6860) updates only the existing EN/zh description for v0.9.0. / 仅更新已有条目中英描述，等待维护者审核。 |
| [dsh-market](https://github.com/dsh-market/dsh-market#submit-your-plugin) / [dshmarket.com](https://dshmarket.com/browse/) | Its documented catalog source is awesome-dsh-plugin.com/plugins.json. Live JSON contains the existing lemonxiny55/dsh-code-index entry, npm package and version 0.9.0, with the old EN/zh summary. / 市场共用 awesome 目录，实时 JSON 已收录本项目、npm 包及 0.9.0，双语摘要仍旧。 | The same PR #6860 updates this upstream source; it remains open/unmerged on this follow-up check. The market explicitly asks authors not to PR plugin entries into its app repository. No duplicate PR or separate promotional post. / 本轮上游简介 PR 同时覆盖该市场，仍待合并；遵守市场仓库规范，不重复提交条目或另发推广帖。 |
| [bruc3van/awesome-dsh-plugin](https://github.com/bruc3van/awesome-dsh-plugin/blob/main/catalog/agents-workflows.md) | Already listed with task-aware source packs, relations, changes, tests and hard budgets. / 已收录，简介已涵盖核心能力。 | No redundant PR. Its CONTRIBUTING.md forbids hand edits to generated catalog/snapshot files. Automatic upstream refresh is the update path. Self-showcase requires more than 10 stars; no attempt to bypass it. / 不提交重复 PR，不修改自动生成文件，不绕过自荐门槛。 |
| [DSH Plugin Hub](https://dshpluginhub.ai/plugins/dsh-code-index) | Search cache showed 0.8.0; **live browser page already shows 0.9.0**, updated 2026-10-08, and current README. Top EN/中文 summary is still old; DSH compatibility displays `*`; install currently selects a pinned GitHub source. / 实时页面已同步 0.9.0 与新版 README，但顶部摘要旧、兼容栏宽泛，默认安装为固定 GitHub 提交。 | No public catalog-data PR interface found. Use [owner claim/manage](https://dshpluginhub.ai/dashboard/publish/github?repository=lemonxiny55%2Fdsh-code-index&slug=dsh-code-index) after sign-in, or its [report form](https://dshpluginhub.ai/report?package=dsh-code-index). Record the matching 0.2.0-rc.2 runtime and npm command below; no account claim or profile publication performed. / 记录登录认领管理及报告入口，未认领账号或发布 Profile。 |
| [dshbase](https://dshbase.com/plugins/dsh-code-index/) | Public page has stale early README and says not published on npm, with old 0.1.0-rc.6 test information. / 公开页面仍是早期内容，错误标注未发布 npm，验证记录属于旧宿主。 | [Contact page](https://dshbase.com/contact/) directs factual corrections to email with repo URL. No community data PR route found. Ready-to-use correction copy below; no unsolicited email sent. / 仅支持联系维护者纠正，交付可直接发送的双语文案，未发送邮件。 |
| [DSH Hub (dsh-hub.org)](https://dsh-hub.org/) | No dsh-code-index match in the public 317-plugin snapshot checked. / 检查的公开 317 插件快照未找到该条目。 | Site offers “Submit repository” and `hello@dsh-hub.org` for snapshot corrections, not a public data-repo PR. Record route only. / 记录网站提交与联系入口，不另行公开提交。 |
| [dshmp](https://dshmp.com/en/plugins/dsh-code-index) / [DSHPlugin.app](https://dshplugin.app/) | dshmp search cache has a 0.5.0 listing; direct detail requests for these sites failed. / 搜索缓存显示 dshmp 旧条目，实时详情请求失败。 | Current state unconfirmed; do not treat cached version as live or submit duplicates. DSHPlugin.app's public [directory repository](https://github.com/dshplugin-app/deepseek-harness-plugins) points to its website submission route. / 状态未确认，不重复提交；记录网站入口。 |

Catalog PR validation / 目录 PR 检查: followed `CONTRIBUTING.md`; `validateEntries(readEntries())` checked 4424 entries with zero problems; `node scripts/generate-readme.mjs` succeeded. Generated files excluded from the PR. GitHub `check` and `Submission gate` both completed successfully; PR is open, not merged. npm mapping is automatic; no unsupported install/version fields added. The connector could write the fork branch but creating an upstream PR returned 403, so the signed-in browser submitted it successfully. CLI works under the desktop user; sandbox-account authentication errors were not treated as plugin defects.

遵守贡献规范，仅修改自身 YAML 条目；已通过条目校验和生成检查，不提交生成文件、不改其他插件。连接器创建上游 PR 权限不足，已通过登录浏览器完成提交。沙箱账号的认证问题未作为插件缺陷排查。

## Ready-to-use catalog correction / 可直接使用的目录修正文案

### Plugin Hub signed-in follow-up / 登录后的处理

The user signed in. The dashboard still lists zero claimed plugins and zero authorized repositories. Its GitHub connection link reaches `https://github.com/apps/pax-dsh-hub`, which visibly says the App is private and offers no install button. This blocks the normal owner-edit path; no permissions or credentials were created.

用户已登录，但工作台仍显示认领 0 个插件、授权 0 个仓库。GitHub 连接入口实际跳到私有 App 页面，没有安装按钮，常规作者编辑路径受阻；未新建权限或凭证。

Used the dashboard's independent **Sync npm Plugin** form, which explicitly requires no GitHub permission. Submitted only the existing public package name `dsh-code-index`; the UI confirmed **Plugin synced to 0.9.0**. The public detail page still prioritizes the existing GitHub-pinned installation, the earlier summary/README snapshot and compatibility `*`. A successful npm sync therefore does not prove that these presentation fields were corrected. Immutable release/source records were not edited.

已通过不需要 GitHub 授权的 npm 同步入口提交公开包名，页面确认同步到 0.9.0。公开详情仍优先展示 GitHub 固定来源、旧摘要/README 快照及兼容栏 `*`，不能将同步成功说成展示字段已修正；未修改不可变版本/来源记录。

Prepared a bilingual **Other** catalog metadata correction in the site's report form, with the published install command, Release, actual Desktop demo and evidence links; it explicitly states that this is not a security/copyright complaint. The user completed human verification, filled the optional contact field and clicked Submit. The UI reported submission failure; one assistant retry also failed. **Not successfully submitted.** Stopped retrying and preserved the filled tab. No CAPTCHA was solved or bypassed by the assistant; contact details are not recorded here.

已在网站报告表单选择“其他”，填写双语资料修正、安装命令、Release、真实桌面演示和验证链接，明确不是安全/版权投诉。用户完成人机验证、填写可选联系方式并点击提交后，页面显示失败；助手重试一次仍失败。**未成功提交**，已停止重试并保留表单。助手未代做或绕过 CAPTCHA，本文不记录联系方式。

Also opened the live [dsh-market project detail](https://dshmarket.com/p/lemonxiny55/dsh-code-index/) in the browser: it displays the v0.9.0 source-pack capabilities and matching-host install instructions, but its README snapshot still has the earlier local tool-call demo, not the newly recorded Desktop GIF. The market documents automatic catalog/README refresh; the new top EN/zh description depends on upstream PR #6860 merging. Its separate comments area was not used, consistent with this round's single official Discussion reply.

浏览器实时详情已展示 v0.9.0 Context Pack 能力与匹配宿主安装命令，但 README 快照仍用此前本地工具调用演示，尚未显示新桌面 GIF。市场有自动目录/README 刷新流程；顶部双语简介需要上游 PR #6860 合并。未在其独立评论区另发推广，保持本轮只更新官方原 Discussion 的范围。

**EN:** dsh-code-index v0.9.0 is published on npm. One `code_context` call returns key source excerpts with accurate line ranges, inclusion reasons, relationship provenance, Git changes and likely tests within a hard character budget. Local repo/worktree indexes remain isolated and refresh after external edits. The text/pack workflow was verified with a real DSH Desktop 0.2.0-rc.2 Agent. Likely tests are leads, not coverage proof. Please refresh the description/version and show the matching host requirement; old-host checks do not prove v0.9 compatibility.

**中文：** dsh-code-index v0.9.0 已发布 npm。一次 `code_context` 在严格字符预算内返回关键源码、准确行号、入选理由、关系来源、Git 变更和相关测试线索。本地 repo/worktree 索引隔离，外部编辑后自动刷新。文本/pack 工作流已通过真实 DSH Desktop 0.2.0-rc.2 Agent 验证，测试线索不等于覆盖率证明。请刷新简介与版本，并展示匹配的宿主要求；旧宿主验证不能代替 v0.9 的兼容证据。

```sh
npx @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add dsh-code-index@0.9.0
npx @deepseek-ai/dsh@0.2.0-rc.2 web
```

[Release](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.9.0) · [Demo / 演示](assets/desktop-agent-v090.gif) · [Evidence / 验证](RELEASE_EVIDENCE_v0.9.0.md)

## Demo and README / 演示与文档

Initially delivered the [42-second bilingual terminal replay](assets/agent-context-demo.md) of audited 2026-10-05 Agent records. After the user offered desktop access, the native control entry point became available. Recorded a new real DSH Desktop task on 2026-10-08 with the installed/running **v0.9.0** plugin. The user started/stopped Windows Snipping Tool in single-window mode; the assistant submitted the task and inspected the actual tool card. No reinstall or runtime changes were needed. The Agent made one `code_context` call returning **2347/5000 characters**, then explained the case conversion in Chinese and English.

起初交付 10 月 5 日记录的中英终端回放；用户提供桌面操作时间后，原生控制入口已可用。本轮于 10 月 8 日新录制真实 DSH Desktop 交互，详情界面确认 **v0.9.0** 已安装、启用、运行。用户协助截图工具启动/停止单窗口录屏，助手提交任务并查看实际工具卡片。未重装或改变运行环境。Agent 一次 `code_context` 返回 **2347/5000 字符**，随后给出中英文大小写定位解释。

The new [desktop footage](assets/desktop-agent-v090.md) is a 42-second silent MP4 (711404 bytes) and GIF (1390225 bytes), both 1280×818, plus a poster, UI evidence and SHA256/edit manifest. Only chronological cuts, resizing, frame sampling and audio removal were applied. The 349.83-second raw recording remains locally preserved outside Git. The bilingual READMEs now show this actual desktop GIF first and retain the earlier terminal replay as supplementary evidence. The existing Discussion reply is updated in place to reference the desktop footage, with no duplicate reply. No fix/test pass, performance gain, or new release gate is claimed.

新素材为 42 秒无声 MP4、GIF（均为 1280×818）、预览图、实际 UI 证据及哈希/选段清单。只做顺序剪切、缩放、帧采样和去音轨；349.83 秒原片在 Git 之外本地保留。两种 README 优先展示真实桌面 GIF，原终端回放作为补充。原 Discussion 回复就地更新引用，无重复回复。不宣称修复、测试通过、性能提升或重新完成发布门禁。

Verification / 检查: decoded MP4/GIF duration and dimensions; visually inspected all selected scenes; output SHA256 matched the manifest; actual UI text includes the tool, source ranges, provenance and budget; local README asset links and final whitespace checked. These are artifact/document checks. `HANDOFF_PROMPT.md` remains untracked and untouched.

已检查视频/GIF 时长、尺寸、所有选段画面、输出哈希、实际工具卡片中的行号/来源/预算、README 素材链接及 whitespace。这些是展示素材和文档检查；`HANDOFF_PROMPT.md` 保持未跟踪且未改动。

Outstanding / 剩余: upstream catalog PR review and site-owner catalog edits. New desktop screen capture is complete. This round does not claim new Stars, downloads or user feedback.

待办仅为目录 PR 的外部审核和站点维护者的信息修正，真实桌面录屏已完成。本轮不宣称获得了新增 Stars、下载量或用户反馈。
