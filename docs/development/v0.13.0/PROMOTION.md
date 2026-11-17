# v0.13.0 候选演示文案 / Candidate demo copy

状态：可审阅草稿，**未发布、未发送**。配图只使用本目录教程链接的新版实机 JPEG；不复用已删除媒体。开发版本仍为 0.13.0-dev.0。

## 中文短文案

改了一个函数，审阅前还需要知道什么？

dsh-code-index v0.13.0 开发候选加入 Review Brief：一次 code_change_context 查询，把变更函数当前源码、潜在静态影响、候选测试线索、证据缺口和仓库版本信息放在预算受控的输出中。

它会区分 exact 调用、import-scoped 模块依赖和 name-only 测试线索；也会明确告诉你哪些证据没有找到、哪些测试没有执行。没有找到静态调用者，不等于没有运行时使用者。

提供 Node 22/24 可复现的 A/B/C 小示例，以及 DSH 0.2.2-rc.3 实机截图。演示截图为明确标注的 Host API 回放；真实 Agent 对照另有记录。AgentTeam 自动交接继续暂缓。

教程：[中文](DEMO.zh-CN.md) · [English](DEMO.en.md)。

## English copy

Changed a function. What evidence should a reviewer inspect next?

The dsh-code-index v0.13.0 development candidate adds Review Brief to code_change_context: current changed-symbol source, potential static impact, candidate test leads, evidence gaps and repository identity in one budgeted output.

Exact calls, import-scoped dependencies and name-only test leads stay distinct. Missing static callers do not prove there are no runtime users. Candidate tests remain unexecuted and coverage unverified.

Reproduce the A/B/C fixtures on Node 22/24 and inspect real DSH 0.2.2-rc.3 Desktop captures. Screenshots are explicitly labelled Host API replays; real Agent comparisons have separate evidence. Automatic AgentTeam handoff remains deferred.

## 配图与讲解顺序

| 素材 | 用途 | 必须保留的说明 |
|---|---|---|
| `desktop-review-A.jpg` | 当前源码、调用者、测试线索 | Real Desktop · Host API replay · no model call |
| `desktop-review-A-gaps.jpg` | 测试未执行、缺口和预算 | Evidence gaps are visible; coverage unverified |
| `desktop-text-A.jpg` | 旧 text 输出对照 | Legacy text format |
| 其余新增 JPEG | 依实际验收记录使用 | 不把 Host 回放写成模型成功截图 |

60–90 秒口播顺序：展示 Git diff → review → 当前函数正文 → checkout 静态调用 → 未执行的测试线索 → 滚动到缺口 → C 的零关系边界 → 说明版本为开发候选。这里只提供拍摄脚本与真实 JPEG，不声称已经录制视频。

不要使用“完整运行时影响”“测试覆盖已验证”“审阅结论保证正确”“接口迁移安全”“所有语言语义精确”“AgentTeam 已自动交接”或未测量的效率百分比。
