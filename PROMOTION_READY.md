# Promotion ready — dsh-code-index v0.11.1

Prepared 2026-10-26. Public copy is a draft only; nothing here has been posted, commented or messaged.

## README first-screen change

| Before | After |
| --- | --- |
| Described the plugin, Desktop rc.2 install, demo, many detailed feature bullets, relationship legend, numeric UI caps, reproduction instructions, and ArkTS context before the page navigation. | States the audience and job in one sentence; gives stable v0.11.1 install first; puts the actual demo GIF and MP4 near the top; summarizes evidence and uncertainty in three short bullets. |
| Install callout named DSH Desktop 0.2.1-rc.2, obscuring the newly supported rc.3 group. | Names all three declared host groups and carefully says Desktop rc.3's warning disappeared without claiming full Electron Desktop or Agent acceptance. |
| The 30-second clip was visually identified, but its `0.11.0-dev.0` provenance and the limits of the recording appeared amid a long first-screen block. | Keeps the clip provenance close to the demo and clearly says this is not a model-driven Agent latency or success claim. |
| Implementation details competed with the five-second explanation. | Retains static-analysis, source-evidence, and candidate-test boundaries near the top; leaves full mechanics and caps in later sections. |

The README changes are mirrored in English and Chinese. Versioned install examples use `dsh-code-index@0.11.1`.

## Suggested post for the existing DSH discussion

There is already a project introduction in [Show Your Plugins! discussion #5623](https://github.com/deepseek-ai/deepseek-harness/discussions/5623), with six historical update comments. Avoid creating a second introduction thread. Recommended action, after owner review: edit the original post's top section or add one concise v0.11.1 update comment, then stop and respond only to substantive replies.

### English draft

**Impact X-Ray: see the blast radius before your AI edits the code**

When an agent changes a function, I want to inspect the likely ripple effects before trusting the edit. Impact X-Ray presents `dsh-code-index`'s existing change analysis as an interactive view: start from a Git diff, inspect possible callers, import relationships and test leads, then click a relationship to check its source location and evidence.

The 30-second clip uses a real DSH Desktop recording: `normalize()` changes, likely callers and a test appear, and selecting a relationship opens the actual source location. It also shows an uncertain `name-only` candidate, so the graph is a review aid—not a promise of runtime impact or test coverage.

v0.11.1 is the current stable npm release. It declares DSH `0.2.0-rc.2`, `0.2.1-rc.2` and `0.2.1-rc.3` host groups. A macOS user successfully re-tested the compatibility fix; the rc.3 compatibility warning disappeared, while full Electron Desktop feature and model-driven Agent acceptance are not claimed. The rc.3 Web/Host validation and its scope are documented below.

- Project: https://github.com/lemonxiny55/dsh-code-index
- Demo (30-second MP4): https://github.com/lemonxiny55/dsh-code-index/blob/main/assets/impact-xray-mvp.mp4
- Demo provenance and limitations: https://github.com/lemonxiny55/dsh-code-index/blob/main/assets/impact-xray-mvp-demo.md
- Install: `dsh plugin --profile desktop add dsh-code-index@0.11.1`
- v0.11.1 evidence: https://github.com/lemonxiny55/dsh-code-index/blob/main/RELEASE_EVIDENCE_v0.11.1.md

If you try it, which relationship was useful, missing or misleading? Please include the DSH/plugin versions, language and a rough repository size; a small public reproducer helps. Please don't share private source or credentials.

### 中文草稿

**Impact X-Ray：在 AI 修改代码前，看清潜在影响范围**

Agent 改动一个函数后，我希望先检查可能的连带影响，再决定是否信任这次修改。Impact X-Ray 将 `dsh-code-index` 既有的变更分析呈现为交互视图：从 Git diff 出发，查看可能的调用者、导入关系和测试线索，再点击关系核对源码位置与证据。

这段 30 秒视频来自真实 DSH Desktop 录屏：`normalize()` 发生变化后，界面展示可能的调用者和测试；点击关系可打开实际源码位置。画面也保留了一个不确定的 `name-only` 候选，因此这张图是辅助审查的线索，不保证运行时影响或测试覆盖。

当前稳定 npm 版本为 v0.11.1，声明支持 DSH `0.2.0-rc.2`、`0.2.1-rc.2` 和 `0.2.1-rc.3` 宿主版本组。macOS 用户已成功复测兼容性修复，rc.3 兼容性提示随之消失；这不代表 Electron Desktop 全部功能或模型驱动 Agent 验收通过。rc.3 Web/Host 的验证范围见下方资料。

- 项目主页：https://github.com/lemonxiny55/dsh-code-index
- 30 秒 MP4：https://github.com/lemonxiny55/dsh-code-index/blob/main/assets/impact-xray-mvp.mp4
- 演示来源与限制：https://github.com/lemonxiny55/dsh-code-index/blob/main/assets/impact-xray-mvp-demo.md
- 安装：`dsh plugin --profile desktop add dsh-code-index@0.11.1`
- v0.11.1 验证资料：https://github.com/lemonxiny55/dsh-code-index/blob/main/RELEASE_EVIDENCE_v0.11.1.md

如果你试用，欢迎指出哪条关系有帮助、遗漏或误导。请附 DSH/插件版本、语言和大致仓库规模；公开的最小复现也很有帮助。请勿分享私有源码或凭据。

## Short community share

### English

Before an AI edit lands, inspect the possible ripple effects. Impact X-Ray for DSH maps changed code to likely callers, imports and test leads, with clickable source evidence—and keeps uncertain matches visible. Real 30-second Desktop demo: https://github.com/lemonxiny55/dsh-code-index/blob/main/assets/impact-xray-mvp.mp4 · Project/install: https://github.com/lemonxiny55/dsh-code-index

### 中文

AI 改代码前，先检查可能的连带影响。DSH 插件 Impact X-Ray 会从变更展示可能的调用者、导入与测试线索，并可点击关系核对源码证据；不确定匹配也会明确保留。30 秒真实 Desktop 演示：https://github.com/lemonxiny55/dsh-code-index/blob/main/assets/impact-xray-mvp.mp4 · 项目与安装：https://github.com/lemonxiny55/dsh-code-index

## Demo plan (15–30 seconds)

Use the existing [30-second MP4](assets/impact-xray-mvp.mp4), preferably embedded inline. It is a continuous, normal-speed excerpt of an actual Desktop recording. Do not re-record or add overlays for this campaign.

1. 0–5s: show the changed `normalize()` declaration.
2. 5–14s: show likely callers, indirect path and test lead.
3. 14–23s: select an exact relationship and inspect actual file/line/source.
4. 23–30s: show the dotted amber `name-only` relationship to make uncertainty visible.

The MP4 is 30 seconds, 900 frames at 30 fps, silent. A 30-second GIF and poster are also available at `assets/impact-xray-mvp.gif` and `assets/impact-xray-mvp-poster.png`. Recording provenance, editing method and scope are documented at `assets/impact-xray-mvp-demo.md` and `assets/impact-xray-mvp-media.json`. GitHub README demo links are relative: `assets/impact-xray-mvp.mp4`, `assets/impact-xray-mvp.gif`.

## Traffic baseline and measurement gap

Snapshot date: 2026-10-26 (Asia/Shanghai). Public repository page currently shows **10 Stars and 1 Fork**. This is a count snapshot, not a pre-campaign traffic measure.

Could not retrieve private Traffic Insights data. `gh auth status` says the configured GitHub token is invalid. The unauthenticated GitHub REST API calls for `/traffic/views`, `/traffic/clones`, `/traffic/popular/referrers` and `/traffic/popular/paths` returned HTTP 403 rate-limit errors. Traffic endpoints require an authenticated account with repository push access; this workspace has no usable credential, so these values are **unavailable**, not zero:

- Prior 14 days: total views / unique visitors — unavailable.
- Prior 14 days: clones / unique cloners — unavailable.
- Top referrers / popular paths — unavailable.

To establish a complete starting point, an owner with repository push access should open GitHub **Insights → Traffic** and record the 14-day views, unique visitors, clones, unique cloners, referrers and popular content on the day the first post is published. Capture a screenshot or export the visible table as the campaign baseline. GitHub retains this traffic view for rolling 14-day windows, so save snapshots at day 0, day 7 and day 14.

Compare the pre-campaign 14-day snapshot with each follow-up snapshot. Record Stars/Forks alongside traffic, and annotate post dates and any other releases or announcements. Use views/referrers to assess exposure; unique visitors against repo visits and Stars/Forks as weak conversion signals; clones plus issue/discussion feedback as stronger intent signals. Traffic paths can show README attention, but GitHub's aggregate counts cannot establish why an individual visitor did or did not star.

Interpretation:

- **Exposure problem:** views and unique visitors stay low; inspect whether the intended DSH audience saw the existing discussion and shared demo.
- **README conversion problem:** qualified repo visits rise but Stars/Forks, installs/clones or substantive feedback do not; review first-screen clarity, compatibility fit and install success reports.
- **Narrow audience:** exposure and engagement are reasonable in the DSH community but reach remains capped; confirm whether non-DSH users can use the project before expanding channels. Do not broaden the compatibility promise to chase reach.

Stars alone do not distinguish these cases.

## 7–14 day plan

| Timing | Action | Observe |
| --- | --- | --- |
| Day 0 | After review, update the existing DSH Discussion #5623 with the English copy and add the Chinese version as the same update. Record Insights baseline first. | Baseline views, visitors, clones, referrers, popular content, Stars/Forks. |
| Day 1–3 | Reply only to genuine questions or reports. Do not bump the thread without new evidence. | Substantive replies, install questions, host versions/languages represented. |
| Day 4–7 | Share the short copy once in one relevant developer community whose rules permit project posts. Reuse the MP4. Save day-7 Traffic snapshot. | New referrers, unique visitors, demo README path, clones, issue/discussion feedback. |
| Day 8–14 | Make at most one targeted follow-up where the audience fits; otherwise spend time responding to users. Save day-14 snapshot. | Compare change against baseline; separate exposure from conversion and audience ceiling. |
| Day 14 | Decide whether to improve README conversion, seek a better-matched DSH audience or hold promotion and gather product feedback. | Traffic deltas, repeated use/clone signals, feedback quality, compatibility fit; Stars are secondary. |

No mass posting, unsolicited DMs, paid promotion, fake endorsements or claims that XERJ's ArkTS submission is publicly listed are part of this plan.

