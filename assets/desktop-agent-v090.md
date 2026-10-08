# Real DSH Desktop demo / 真实 DSH 桌面演示

[GIF](desktop-agent-v090.gif) · [MP4](desktop-agent-v090.mp4) · [Poster / 预览](desktop-agent-v090.png) · [Provenance / 剪辑清单](desktop-agent-v090.provenance.json) · [UI evidence / 界面证据](desktop-agent-v090.evidence.json)

Recorded on 2026-10-08. The DSH plugin detail page showed **dsh-code-index v0.9.0**, enabled and running. The assistant submitted a bilingual task through the actual DSH Desktop UI. The user started/stopped Windows Snipping Tool in single-window mode and saved the footage. This is a new desktop recording, not a terminal reconstruction, mock UI, direct plugin `execute()` call, or generated screenshot.

2026-10-08 录制。DSH 插件详情显示 **dsh-code-index v0.9.0** 已启用、运行中。助手通过真实 DSH Desktop 界面提交中英文任务；用户协助启动、停止 Windows 截图工具的单窗口录制并保存视频。这是新录制的桌面画面，不是终端重建、模拟界面、直接调用插件 `execute()` 或生成截图。

## What happened / 实际过程

The existing tiny `desktop-v09-live` fixture contains a current Git edit changing `loadConfig` from `input.trim()` to `input.trim().toUpperCase()`. The task asks why `' input '` becomes `'INPUT'`, requests one `code_context` call with a 5000-character budget, and forbids file edits/tests. The actual tool card returned **2347/5000 characters** including:

已有小仓库 `desktop-v09-live` 的当前 Git 改动把 `loadConfig` 从 `input.trim()` 改为 `input.trim().toUpperCase()`。任务询问大小写变化，要求一次 `code_context`、5000 字符预算，禁止修改文件和运行测试。实际工具卡片返回 **2347/5000 字符**，包含：

- `loadConfig`, `src/config.ts:1–3`, current source and the exact-symbol inclusion reason / 当前源码与精确符号入选理由。
- Modified `loadConfig`, added `betaCaller`, deleted `removed` with the baseline commit reference / 修改、添加、删除的 Git 证据与基线提交。
- `tests/config.spec.ts:1–4`, an import-scoped test lead / 带 import-scoped 来源的测试线索。
- `startup`, `src/startup.ts:2–2`, with `exact; explicit-import-binding` provenance / 直接调用者及关系来源。
- Bounded relationships with explicit `exact` and `name-only` resolution labels, plus the budget / 有界关系、明确解析标签和预算。

The Agent used the returned context to identify `.toUpperCase()`. The tool card was expanded and scrolled after the Agent completed. The clip preserves actual Chinese/English task and answer text. Source output is not replaced or retyped for the video.

Agent 使用返回的上下文定位 `.toUpperCase()`。完成回答后，助手展开并滚动实际工具卡片。视频保留真实中英任务、回答与工具输出，没有替换或重新输入源码来制作画面。

## Editing and limits / 剪辑与边界

The original is 349.83 seconds, 1920×1226. Eight chronological excerpts make a 42-second silent MP4 at 1280×818, 15 fps; the GIF samples the edited video at 2 fps. No generated overlays or other app footage are added. Setup, provider/host retries, waiting and redundant holds are shortened or omitted. The manifest records original SHA256, excerpt times, output hashes and sizes. The raw recording is retained locally, outside the Git repository; the public assets are the short MP4/GIF and supporting evidence.

原片 349.83 秒、1920×1226。按原时间顺序选取八段，形成 42 秒、1280×818、15 fps 的无声 MP4；GIF 从短片按 2 fps 采样。没有添加生成的界面、叠字或其他应用画面。准备、模型/宿主重试、等待及重复停留经过删减；来源清单保留原片 SHA256、选段时间、输出哈希和大小。原片在本地另存，公开仓库只提交短片和证据。

This is a context demonstration, not a fix, test pass, benchmark, or a new release gate. The test fixture has no assertion; its inclusion is a lead, not coverage proof. The Agent's inference about business intent from a comment is not established by the context. The source does establish the case conversion. Desktop renders the requested pack as text; the accessible-text evidence normalizes whitespace and does not establish canonical DTO serialization or independently recount its character budget. Repo isolation and external-edit freshness are covered by the existing [v0.9.0 release evidence](../RELEASE_EVIDENCE_v0.9.0.md), not demonstrated by this single call.

这是上下文展示，不是修复、测试通过、benchmark 或新一轮发布门禁。示例测试没有断言，入选仅是线索，不证明覆盖率。Agent 根据注释推断业务意图并非上下文能证明的事实；源码能够证明大小写转换。Desktop 把请求的 pack 渲染成文本；可访问性证据会归一化空白，不用于证明规范 DTO 的序列化或独立重算预算。项目隔离和外部编辑刷新已有 [v0.9.0 发布证据](../RELEASE_EVIDENCE_v0.9.0.md)，本次单调用不展示这些场景。

## Reproduce / 复现

Open a small Git repository in DSH Desktop with the installed v0.9.0 plugin. Use a configuration function, its caller and a test importing it; make a local case-conversion edit. Ask the Agent:

在 DSH Desktop 打开小 Git 仓库，使用已安装的 v0.9.0。准备配置函数、调用者及导入它的测试，在本地把函数改为转换大小写，再询问 Agent：

> Why does loading `' input '` change its letter case? Call `code_context` once with `task="Review current changes to loadConfig whitespace and letter case"`, `outputFormat="pack"`, `budgetChars=5000`. Explain using the returned source, inclusion reasons, relationships, Git changes and test leads. Do not modify files or run tests.

> 加载 `' input '` 为什么改变了大小写？先按上述参数调用一次 `code_context`，根据源码、入选原因、关系、Git 变化及测试线索解释原因，不修改文件或运行测试。

Exact output varies with repository contents and paths. To reproduce only the edit from the original footage, use `scripts/process-desktop-demo.py FFMPEG RAW_MP4 EDIT_JSON`; the provenance manifest contains the segments and duration. The earlier [terminal replay](agent-context-demo.md) remains separately labeled and unchanged.

具体输出会随仓库内容、路径变化。仅复现原片剪辑可使用上述脚本，来源清单包含选段与时长。先前的[终端回放](agent-context-demo.md)保留独立来源标注。
