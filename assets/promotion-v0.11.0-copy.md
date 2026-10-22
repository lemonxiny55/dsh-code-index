# v0.11.0 promotion copy — approval drafts / 推广文案待审稿

Prepared 2026-10-22. **Not published.** These are AI-assisted drafts for the maintainer to check and approve with each exact destination. They are not permission to post. The [review plan](../PROMOTION_v0.11.0.md) records channel-specific restrictions; do not paste these drafts into HN, V2EX or DEV as promotional posts.

## 1. Existing official DSH Discussion / 原官方仓库讨论

Target: [Discussion #5623](https://github.com/deepseek-ai/deepseek-harness/discussions/5623). Proposed action after approval: edit the author's original post and title in place, retaining the existing reply history. Do not create a second discussion or an extra announcement comment. Read the live post again before editing and preserve any intervening human changes.

Proposed title: **dsh-code-index v0.11.0 — Impact X-Ray: inspect potential impact and source evidence**

### English body

I maintain **dsh-code-index**, an independent community plugin for DeepSeek Harness. v0.11.0 adds **Impact X-Ray**, an interactive view of the plugin's existing change-context analysis.

**See the blast radius before your AI edits the code.**

Start with a real Git diff. See changed declarations, callers, indirect paths, imports and candidate tests. Click a node or relationship to inspect why it was included, its file and line, and available source evidence. `exact`, `import-scoped` and dotted amber `name-only` relationships remain distinct; unmapped changes, missing evidence and truncation are visible.

![30-second real DSH Desktop demo](https://raw.githubusercontent.com/lemonxiny55/dsh-code-index/v0.11.0/assets/impact-xray-mvp.gif)

The real 30-second clip shows a change to `normalize()`, caller/test relationships, an actual call site and an uncertain name-only candidate. It is footage of the `0.11.0-dev.0` MVP in DSH Desktop 0.2.1-rc.2. The later first-screen improvements have [separate real screenshots](https://github.com/lemonxiny55/dsh-code-index/blob/v0.11.0/IMPACT_XRAY_RC.md#首屏与实机操作). [MP4 and reproduction notes](https://github.com/lemonxiny55/dsh-code-index/blob/v0.11.0/assets/impact-xray-mvp-demo.md).

Install into an existing Desktop 0.2.1-rc.2 profile with Desktop's bundled CLI, then restart Desktop:

```sh
dsh plugin --profile desktop add dsh-code-index@0.11.0
```

Ask the Agent to call:

```json
{"repoRoot":"/absolute/path/to/repo","outputFormat":"xray"}
```

Use `code_change_context`, expand its result, choose **Expand view**, then select an arrow. The UI offers English and 简体中文.

This presents existing analysis; it does not add a new analysis engine. Default tool text and `code_context` Context Packs remain compatible. Potential impact is not guaranteed runtime impact; test leads do not prove coverage or failure. Bounded UI results do not bound the existing index's peak memory, and source is a request-time snapshot. Desktop 0.2.1-rc.2 received full UI verification. 0.2.0-rc.2 passed installation/ToolRuntime checks; its full X-Ray UI was not validated. The exact peer range is unchanged.

Try it on one small change: which relationship helped you, and which was missing or misleading? Please include the DSH/plugin version, language and approximate repo size, expected versus actual result, and a tiny public reproducer if possible. [Feedback form](https://github.com/lemonxiny55/dsh-code-index/issues/new?template=feedback.yml) · [Release](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.11.0) · [Evidence and limitations](https://github.com/lemonxiny55/dsh-code-index/blob/main/RELEASE_EVIDENCE_v0.11.0.md).

Earlier release updates and user feedback remain in this thread's replies.

### 中文正文

我是 **dsh-code-index** 的维护者。这是独立维护的 DeepSeek Harness 社区插件；v0.11.0 新增 **Impact X-Ray**，把插件已有的变更上下文分析呈现为可交互界面。

**在 AI 修改代码前，看清潜在影响范围。**

从真实 Git diff 开始，查看变更声明、调用者、间接路径、导入和测试候选。点击节点或关系，检查纳入原因、文件行号及可用的真实源码证据。`exact`、`import-scoped` 和黄色点线 `name-only` 保留各自语义；未映射变更、缺失证据和结果裁剪会明确显示。

上方 30 秒真实录屏依次展示 `normalize()` 的修改、调用者与测试、实际调用位置，以及不确定的 name-only 候选。画面来自 DSH Desktop 0.2.1-rc.2 中的 `0.11.0-dev.0` MVP；后续首屏改进另有实机截图，录屏没有冒充后续版本。[MP4 与复现说明](https://github.com/lemonxiny55/dsh-code-index/blob/v0.11.0/assets/impact-xray-mvp-demo.md)。

在现有 Desktop 0.2.1-rc.2 profile 中，使用 Desktop 自带 CLI 安装上方固定版本，重启 Desktop。让 Agent 调用 `code_change_context`，参数为实际仓库的绝对路径与 `outputFormat: "xray"`；展开结果，选择“放大查看”，点击箭头。界面支持 English / 简体中文。

本次复用既有分析，不宣称新增分析引擎；默认工具文本和 `code_context` Context Pack 保持兼容。潜在影响不等于运行时必然受影响，测试线索不证明覆盖率或必然失败。有界展示不限制既有索引的峰值内存；源码是请求时快照。完整 UI 已在 Desktop 0.2.1-rc.2 实机验证；0.2.0-rc.2 仅通过安装/ToolRuntime 检查，完整 X-Ray UI 未验收，精确 peer 范围不变。

欢迎用一个小改动试试：哪条关系有帮助，哪些关系遗漏或误导了你？请提供宿主/插件版本、语言和大致仓库规模、预期与实际结果；可公开的最小复现最有帮助。[反馈表单](https://github.com/lemonxiny55/dsh-code-index/issues/new?template=feedback.yml) · [正式发布](https://github.com/lemonxiny55/dsh-code-index/releases/tag/v0.11.0) · [证据与限制](https://github.com/lemonxiny55/dsh-code-index/blob/main/RELEASE_EVIDENCE_v0.11.0.md)。历史版本更新和用户反馈仍保留在本帖回复中。

## 2. Existing marketplace entry / 已有市场条目

Target: [existing YAML](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/HEAD/data/plugins/lemonxiny55__dsh-code-index.yml). After approval, propose an upstream PR updating only this entry's two description fields. The previous [PR #6860](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6860) is already merged. Recheck open PRs before submitting; do not reopen it or create another plugin entry. dsh-market consumes this source, so do not submit the same entry to the market app repository.

### English / 中文 descriptions (proposed YAML)

```yaml
url: https://github.com/lemonxiny55/dsh-code-index
name: lemonxiny55/dsh-code-index
category: tools
description:
  en: 'Local code context for DSH: Impact X-Ray presents potential change impact, callers, imports and test leads with inspectable source evidence and explicit uncertainty; also provides symbol navigation, bounded Context Packs, ArkTS support and repo/worktree isolation.'
  zh: 'DSH 本地代码上下文：Impact X-Ray 展示变更的潜在影响、调用者、导入和测试线索，提供可检查的源码证据并明确不确定性；同时保留符号导航、有界 Context Pack、ArkTS 支持和仓库/worktree 隔离。'
```

Reviewer note / 供目录维护者核对：Published version is 0.11.0. The entry schema does not need a version or npm key; npm mapping is automatic. Full X-Ray UI was verified only in Desktop 0.2.1-rc.2; 0.2.0-rc.2 has installation/ToolRuntime evidence only. Screenshots and the authentic dev.0 GIF are already in the repository. No compatibility endorsement or performance claim is requested. / 正式版本为 0.11.0，不增加 version/npm 字段，不请求目录为兼容性或性能背书。完整 UI 与旧宿主的验证边界同上。

## 3. Short introduction for open-source developers / 面向普通开源开发者

Destination: **not selected or approved yet**. Use as repository copy or a factual briefing until a specific community's rules and the maintainer's existing post history are checked. This draft is not suitable for HN/V2EX, which prohibit generated text, or DEV promotional posting under its AI-content restrictions.

### English

Before letting an AI change a shared function, I want to inspect its callers and test leads—and see the source behind the relationships.

I maintain **dsh-code-index**, a local plugin for DeepSeek Harness. Its v0.11.0 **Impact X-Ray** view turns existing change-context analysis into a clickable graph: changed declarations, callers, imports and candidate tests, with file/line evidence and visible uncertainty. `name-only` matches stay lower confidence; test leads are not coverage proof.

[Watch the real 30-second Desktop demo](https://github.com/lemonxiny55/dsh-code-index/blob/v0.11.0/assets/impact-xray-mvp-demo.md) or [try v0.11.0](https://github.com/lemonxiny55/dsh-code-index#impact-x-ray). It requires DSH; full UI verification covers Desktop 0.2.1-rc.2. The footage is the genuine dev.0 MVP; later first-screen changes have separate real screenshots. Static-analysis, snapshot and index-memory limits are documented.

What would you need to verify before trusting an impact view on your repository? A missing or misleading relationship with a small reproducer is especially useful feedback.

### 中文

让 AI 修改一个共享函数前，我想先看看它的调用者和测试线索，并核对关系背后的源码。

我维护的 **dsh-code-index** 是 DeepSeek Harness 本地插件。v0.11.0 的 **Impact X-Ray** 将已有变更上下文分析变为可点击的图：变更声明、调用者、导入和测试候选，附文件行号与源码证据，并显示不确定性。`name-only` 保留低置信度语义，测试线索不代表覆盖率证明。

[30 秒真实 Desktop 演示](https://github.com/lemonxiny55/dsh-code-index/blob/v0.11.0/assets/impact-xray-mvp-demo.md) · [安装与试用](https://github.com/lemonxiny55/dsh-code-index#impact-x-ray)。需要 DSH；完整 UI 实测覆盖 Desktop 0.2.1-rc.2。录屏来自真实 dev.0 MVP，后续首屏改进另有实机截图；静态分析、源码快照和索引内存限制均已说明。

在自己的仓库里信任一张影响图之前，你最想核对什么？欢迎提供遗漏或误导关系的最小复现。
