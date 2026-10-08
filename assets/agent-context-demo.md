# 42-second Context Pack demo / 42 秒 Context Pack 演示

[GIF](agent-context-demo.gif) · [Still image / 静态图](agent-context-demo.png) · [Terminal replay / 终端回放](agent-context-demo.cast) · [Provenance / 来源清单](agent-context-demo.provenance.json)

**Terminal-style replay of real DSH Desktop Agent logs, not desktop screen capture.** The source is the public [audited tool evidence](desktop-v0.9-tool-evidence.json), captured on 2026-10-05 with DSH Desktop/Tools `0.2.0-rc.2` and the implementation shipped in v0.9.0. No native desktop recording interface is available in this session. We reuse the actual records rather than recreate a desktop UI.

**真实 DSH Desktop Agent 记录的终端式回放，非桌面录屏。** 来源为 2026-10-05 使用 DSH Desktop/Tools `0.2.0-rc.2` 验证 v0.9.0 发布实现时保存的公开工具记录。本轮环境未提供原生桌面录制接口，因此使用已有真实记录，未重建或模拟桌面界面。

The seven panels show the task and actual `code_context` arguments, primary source, caller and provenance, likely tests, fresh Git changes after an external edit, baseline deleted source and budget fallback, then an editorial guide to the context received. Original English tool output is retained; panel headings and narration are bilingual. `repoRoot` is omitted from the displayed arguments; source excerpts, reasons and provenance are copied verbatim, with display wrapping. The final guide is authored narration, **not a fabricated Agent reply**.

七个画面依次展示任务和真实 `code_context` 参数、关键源码、caller 与关系来源、相关测试、外部编辑后的 Git 变化、删除项基线源码和预算降级，最后解释 Agent 已获得哪些上下文。工具原文保留英文，标题和展示说明提供中英文。画面参数省略 `repoRoot`，源码、reason 和 provenance 保留原文，仅为展示换行。末尾说明是编辑说明，**并非伪造的 Agent 回复**。

- Clean task / 干净工作区：call/result `47/48`, `1294/5000` characters.
- Change task / 外部编辑后：`60/61`, `2326/5000` characters.
- Budget fallback / 小预算：`73/74`, `327/500` characters.

The 42 seconds are seven editorial six-second holds, not measured tool latency. This replay does not prove a completed fix, passing tests, test coverage, or performance improvement. Likely tests are retrieval leads. Full project/worktree switching is covered separately in [release evidence](../RELEASE_EVIDENCE_v0.9.0.md), not by this short excerpt.

42 秒是七个画面各停留六秒的剪辑节奏，不是工具耗时。本演示不宣称 Bug 已修复、测试已通过、覆盖率已确认或性能已提升；likely tests 是检索线索。完整项目/worktree 切换证据见发布验证记录，不由这段演示代替。

To render again on Windows with Python and Pillow / Windows 下用 Python 和 Pillow 重新生成：

```sh
python scripts/render-agent-demo.py
```

The renderer reads only the existing evidence JSON, checks recorded character budgets, and writes GIF, PNG, cast and provenance files. Fonts: Windows Consolas and Microsoft YaHei. GIF: 1280×900, 42 seconds, looping, under 1 MB. Playback: open the GIF or use an asciinema-compatible player for the cast. Rendering does not run DSH or a model.

生成脚本仅读取已有证据 JSON，核对记录中的字符预算，输出 GIF、PNG、cast 和来源清单；使用 Windows 的 Consolas 与微软雅黑字体。GIF 为 1280×900、42 秒、循环播放、小于 1 MB。可直接打开 GIF，或用兼容 asciinema 的播放器播放 cast。生成过程不启动 DSH 或模型。
