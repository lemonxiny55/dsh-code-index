# v0.11.0 — PROMOTION REVIEW

Prepared **2026-10-22 (Asia/Shanghai)** from latest main `3fbe39109ce4d9e97fb5430c4b5cc4d86ed2f3e4`, on `codex/promotion-v0.11.0`. This is preparation for maintainer review. No community post, comment, directory submission, advertisement or direct message was sent. No production code, package version, published tag or Release was changed.

## Deliverables / 审查入口

- [English README](README.md#impact-x-ray) / [中文 README](README.zh.md#impact-x-ray): only the opening information order and media/feedback links change. The detailed usage, relationship semantics, bounds, legacy features and limitations below the tool-call instructions are retained.
- [Three bilingual drafts](assets/promotion-v0.11.0-copy.md): existing DSH Discussion, existing market entry, and a short developer introduction. Each names its proposed destination and publication boundary.
- [Preparation baseline](assets/promotion-v0.11.0-baseline.json) / [manual tracking CSV](assets/promotion-v0.11.0-tracking.csv). Future rows intentionally have no invented figures. No recurring automation or telemetry was installed.

## First-visitor audit / 首次访问者审计

Editorial judgment, not a timed user study: the previous opening explains the feature, but first asks visitors to parse dev.0/dev.1 recording history and exact host groups. Four detailed bullets and an implementation paragraph precede the GIF; installation is below the GIF and another recording explanation. A newcomer can recognize a code-analysis tool but must scan substantially further to try it. The Chinese page has the same ordering problem and initially does not explain what DSH is.

原首屏有价值陈述，但版本历史、宿主兼容说明和四条细节先于 Demo；安装又在 GIF 与重复的录屏说明之后。对于第一次听说 DSH 的开发者，产品归属也不够直接。此次改为：**DSH 本地插件与潜在影响 → 固定版本安装 → 30 秒真实 GIF → 原尺寸/MP4/反馈 → 细节及验证边界**。

| First question / 首次访问问题 | Before / 原来 | Proposed / 本分支 |
| --- | --- | --- |
| What is it? / 是什么？ | Version narrative before the product context | One short paragraph explicitly says local DeepSeek Harness plugin, potential callers/imports/tests, clickable source and uncertainty |
| How do I try it? / 如何试用？ | Installation after the large GIF and repeated provenance | Existing fixed `0.11.0` command before the GIF; restart and profile link adjacent |
| Is there a real demo? / Demo 是否真实？ | Real GIF, but significant text above it | Same unmodified GIF with a one-line scenario; full-size GIF and MP4 links below |
| Can I trust the claims? / 声明是否可信？ | Full details available but duplicated near top | One recording provenance note, exact host boundary, evidence links; detailed limits retained |
| How can I help? / 如何反馈？ | Feedback section much lower | Existing feedback form linked next to the media, asking what helped or was missing |

The “10 seconds” target is a design aim, not a measured completion rate or guaranteed literal first viewport. GitHub chrome, font size and screen width vary. The install command precedes the tall GIF so it remains discoverable without watching or scrolling past the recording. There is no claim of improved conversion until observed.

Also fixed the opening screenshot link's nonexistent English anchor to the real `首屏与实机操作` heading in the RC report. No old release report was rewritten.

Source-order comparison against the baseline main (UTF-8 bytes are an order/length measure, not reading time):

| README | First install command line | Bytes before the GIF | GIF source line |
| --- | --- | --- | --- |
| English | 34 → **17** | 1,993 → **1,017** | 25 → 24 |
| 中文 | 31 → **16** | 1,530 → **804** | 22 → 23 |

The Chinese GIF moves one source line later because installation now precedes it; this is not described as a reduced line count. No conversion improvement is inferred from these figures.

## Media assessment / 素材检查

Reuse the [existing GIF](assets/impact-xray-mvp.gif), [MP4](assets/impact-xray-mvp.mp4), [poster](assets/impact-xray-mvp-poster.png) and [RC screenshots](IMPACT_XRAY_RC.md#首屏与实机操作). Provenance: [recording notes](assets/impact-xray-mvp-demo.md) and [SHA256/edit manifest](assets/impact-xray-mvp-media.json).

- Decoded GIF: **30.00 seconds, 1000 × 628, 10 fps**. Visually inspected decoded samples at 0, 6, 18 and 26 seconds. The opening shows the changed `normalize` source and callers/test row; by 6 seconds the exact `startup → normalize` call and file/line evidence are selected; the later name-only selection shows the low-confidence reason. These are samples, not a new frame-by-frame UI acceptance test or timing benchmark.
- The relation rows and evidence-pane separation are readable at native size. Small source and line text becomes difficult at narrow README widths, especially on phones. Provide full-size/MP4 links rather than enlarge a low-resolution frame or claim universal readability. The Chinese RC overview and English name-only screenshot show the later change center, counts and uncertainty. They are genuine screenshots, not frames from the dev.0 video.
- The GIF is **769,594 bytes**; existing manifest hashes for GIF/MP4/poster are rechecked. No new recording, crop, overlay, artificial UI, performance data or screenshot was produced for publication. Inspection frames remain in the ignored local directory only.
- The footage is a real dev.0 MVP replay of a persisted audited result; Git editing happened before filming. The later dev.1 first screen is separately documented. Public copy retains this distinction and never presents the clip as a new formal-version recording or live Agent latency.

结论：现有素材足以进入推广审查；关系与证据的演示已清楚，细小源码应通过原尺寸素材阅读。不需要占用 Desktop 重录，也不建议把历史截图拼成所谓新视频。

## Channel research / 渠道与规则核实

Checked 2026-10-22. Sources below are channel-owned rules or live repository/API records. Prior promotion history in [PROMOTION_v0.9.0.md](PROMOTION_v0.9.0.md) is background, not proof of current state. Priorities are judgments about audience fit, not reach estimates.

| Priority / 渠道 | Self-submission and exact target / 自荐与目标 | Existing state, update route and duplication control / 现状、更新方式 |
| --- | --- | --- |
| **P0 — official DSH repository Discussion** | [Existing #5623](https://github.com/deepseek-ai/deepseek-harness/discussions/5623), category **Show Your Plugins!** whose description invites maker showcases. This is an independent community plugin, not an official DSH product. | Live GraphQL read: open, author `lemonxiny55`, `viewerCanUpdate=true`, six top-level comments and three replies; latest release comment is v0.10.0. Original post still describes v0.3.0. After approval, edit the original post/title using draft 1 and retain its reply history. Do not create a new discussion or another release comment. No separate category-specific frequency rule was found; reread any visible notices before editing. |
| **P0 — awesome-dsh-plugin → dsh-market** | [Contribution rules](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/HEAD/contributing.md) explicitly accept updates to the author's own YAML. Describe actual functions, not superlatives; do not add invented version/npm fields or touch others' entries. | [Existing entry](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/HEAD/data/plugins/lemonxiny55__dsh-code-index.yml) currently describes local context/ArkTS, not X-Ray. [PR #6860](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/6860) is merged (`91fc3b4`); a GitHub REST title search found zero open PRs matching `dsh-code-index` at the check. After approval, one new description-only PR updates the same entry. The [market app's submission rules](https://github.com/dsh-market/dsh-market#submit-your-plugin) direct submissions to that upstream catalog, not the app repo. Recheck existing PRs immediately before submitting. |
| **P1 — independent HackSing directory** | [Contribution rules](https://github.com/HackSing/dsh-plugins/blob/main/CONTRIBUTING.md) permit public DSH projects with purpose/install/license. New entries use the [plugin form](https://github.com/HackSing/dsh-plugins/issues/new?template=submit-plugin.yml); corrections use the [update form](https://github.com/HackSing/dsh-plugins/issues/new?template=update-plugin.yml). Plugin additions by PR are not accepted. | Current EN/zh READMEs and canonical [data/plugins.json](https://github.com/HackSing/dsh-plugins/blob/main/data/plugins.json) contain no `lemonxiny55/dsh-code-index` match. Only consider a new form after approval and an issue-queue duplicate check. If an entry appears by then, update that entry instead. Directory inclusion is not compatibility certification or endorsement. |
| **Hold — Hacker News / Show HN** | [Show HN rules](https://news.ycombinator.com/showhn.html) allow maker projects people can try, generally not routine feature/version upgrades. [Site rules](https://news.ycombinator.com/newsguidelines.html) prohibit generated text in posts and generated/AI-edited comments, vote solicitation and delete/repost promotion. | DSH prerequisite adds trial friction; this is a version update, and these are AI-assisted drafts. **Do not post the supplied copy there.** A future independently written maker submission needs its own suitability decision and prior-post check. No search result is proof that the owner has never posted there. |
| **Hold — DEV #showdev** | [Tag rules](https://dev.to/t/showdev) allow project showcases, with community-oriented copy. [Terms §11](https://dev.to/terms) require substantive content, not link-only promotion. [AI-content rules](https://dev.to/guidelines-for-ai-assisted-articles-on-dev) require disclosure and factual checking but also restrict AI-assisted articles promoting a program, including one's own. | The AI-specific restriction makes this promotional draft unsuitable even though the tag generally welcomes projects. **Do not treat disclosure alone as permission.** Defer this campaign; an independent human technical account would need a separate rules check or moderator clarification. No promotional comments. |
| **Hold — V2EX 分享创造** | [Node](https://v2ex.com/go/create) invites authors' own work, but [site rules](https://v2ex.com/about) prohibit AI-generated content. | **Do not paste this AI-assisted Chinese copy there.** No attempt to conceal its origin, evade the rule or repost under a different node. A future human-authored account must be considered separately and checked for prior posts. |

The market web page returned an older crawler snapshot during research. Its displayed stars/version/README are not treated as current metrics; the existing upstream YAML and repository API records are the basis of the update recommendation. Other historical markets have no freshly verified owner-edit workflow in this round and are not queued for submission. This avoids repeating old failed account/claim attempts.

**推荐顺序：**先审查并批准 #5623 的原帖更新，再批准已有目录的单条描述更新；有需要再评估 HackSing 的新收录。三个通用社区的限制已明确，不把“有人在发自荐”当成允许复制本稿的依据。普通开发者短介绍先作为仓库介绍和事实简报，具体外发地址待单独确认。

## Seven-day observation plan / 七天效果跟踪

Preparation baseline captured **2026-10-22 09:58 Asia/Shanghai / 01:58 UTC** through GitHub REST:

| Metric | Observed | Definition |
| --- | ---: | --- |
| Stars / Forks | **10 / 1** | Current cumulative counts; not growth attributable to this task |
| Issues total / open | **2 / 0** | Excludes all PR entries returned by `/issues`; historical issues #2 and #5 |
| PRs total / open | **6 / 0** | Includes maintainer activity; five merged and one closed unmerged |
| External PRs | **1** | Author differs from `lemonxiny55`; historical #1, not a new campaign outcome |
| v0.11 install feedback / npm downloads | **Unknown / not collected** | Historical issues do not prove v0.11 installs; no invented zero or install conversion rate |

This snapshot precedes the promotion Draft PR, which must be marked as maintainer preparation in later counts. **D0 starts immediately before the first approved public action**, not on this document's date. If approval happens later, recapture the baseline. Store source URLs, exact UTC observation time and the corresponding Asia/Shanghai date; use one consistent daily time (for example 10:00 Asia/Shanghai). No scheduled task is created by this plan.

| Day | Manual work after approval | Record |
| --- | --- | --- |
| D0 | Recheck channel rules, current text and duplicates; capture pre-action snapshot. Publish only the specifically approved original-Discussion update. | Snapshot plus exact edited URL, time, copy revision and channel |
| D1 | Read replies; reproduce reported installation problems minimally. Submit the one catalog update only if separately approved. | Actual feedback URLs, install success/failure reports, maintainer vs external activity |
| D2 | Continue support in existing threads; no bump or duplicate announcement. | Same snapshot definitions; unknown remains blank |
| D3 | Midpoint review: assess missing/misleading relations and setup friction. Consider HackSing only after approval and duplicate check. | Action/approval record, source URLs and feedback categories |
| D4 | Answer concrete reports; consolidate duplicate reports without deleting criticism. | Reproducer/issue links; track report state separately from unique reporter count |
| D5 | Recheck approved catalog PR status and whether listing text actually changed. | Merged/pending status; no claim of storefront refresh without observation |
| D6 | Follow up only in existing conversations where useful; do not solicit stars or private-contact strangers. | Updated report outcome and snapshots |
| D7 | Compare D7 to D0. Summarize adoption signals, valid feedback, unresolved setup/analysis problems. Stop or propose the next campaign for review. | Net Stars/Forks, new issues, external PRs, install self-reports; no causal/accuracy claim |

Use [the CSV](assets/promotion-v0.11.0-tracking.csv) for snapshots and this small activity/feedback ledger when work is approved:

| Timestamp | Channel / exact URL | Approved copy revision | Action | Feedback URL / category | Installation evidence / outcome |
| --- | --- | --- | --- | --- | --- |
| Not started | — | — | Awaiting PROMOTION REVIEW | — | Unknown |

Counting rules:

1. Capture [`/repos/lemonxiny55/dsh-code-index`](https://api.github.com/repos/lemonxiny55/dsh-code-index), [`/issues?state=all&per_page=100`](https://api.github.com/repos/lemonxiny55/dsh-code-index/issues?state=all&per_page=100) and [`/pulls?state=all&per_page=100`](https://api.github.com/repos/lemonxiny55/dsh-code-index/pulls?state=all&per_page=100). Follow pagination as the repository grows. GitHub's `open_issues_count` includes PRs; do not use it as an issue-only count. Save raw responses locally or link public issue/PR records; do not commit credentials or private traffic data.
2. Stars/Forks are net cumulative changes, not unique visitors or installations. Count new issues/PRs by `created_at` during D0–D7, even if they close before D7. Separate maintainer/bot activity, external contributions and duplicates. The promotion PR itself is not community adoption.
3. Installation attempts and successes come only from voluntary reports with version/host details and a source URL. Record failed setup separately; one person reporting the same install in two channels is one known reporter, not two installations. Treat unreported installs as unknown and do not extrapolate from Stars.
4. Optional [npm download API](https://api.npmjs.org/downloads/point/last-week/dsh-code-index) and owner-only [GitHub traffic](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-traffic-to-a-repository) can provide context if accessible. npm downloads include CI, retries and other versions, not verified installs; rolling seven-day totals overlap and must not be summed. Capture the reported date interval. GitHub visits/clones are not plugin activation. An unavailable metric stays blank, not zero.
5. Evaluate feedback quality by concrete task, expected/observed relationship or setup result, and reproducibility; do not count praise as evidence of accuracy. Group setup, missing relation, false positive, source-gap and readability reports. There are no promised seven-day numeric targets or attributable growth claims.

## Checks and stopping point / 核对与停止点

Verification is limited to documentation and authentic existing artifacts: local link/anchor checks, bilingual command/version/compatibility consistency, source-order comparison, media hash/decode inspection, baseline JSON/CSV checks, and a diff proving no production/package files changed. No new release gate, plugin benchmark or Desktop acceptance run is necessary for this documentation-only work. Draft PR CI status is reported separately from these local checks.

Local result: file links and the corrected screenshot-section anchor passed; both detailed README suffixes (starting at the tool-call instructions) match baseline main exactly. Existing GIF/MP4/poster byte sizes and SHA256 hashes match their manifest. Baseline JSON parses; all CSV rows have 15 fields and future observations are blank. `git diff --check` passed. `HANDOFF_PROMPT.md` remains untracked with unchanged SHA256 `05d2be1390a73d588ef6461df8ba583abfb86f771581009da647fca3244d5034`.

**PROMOTION REVIEW:** review the two README openings, three bilingual drafts and their exact destinations. Author approval of a Draft PR does not by itself authorize community posting. No main merge, market submission or public community action follows automatically.

English summary: the preparation prioritizes existing DSH audiences and one shared catalog source, presents a usable installation path and genuine demo, preserves uncertainty and exact host boundaries, and records a real baseline without inventing adoption. All public outreach waits for explicit approval of copy and destination.
