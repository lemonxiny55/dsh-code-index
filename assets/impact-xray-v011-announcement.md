# Impact X-Ray — v0.11.0

**See the blast radius before your AI edits the code.**

Before AI edits your code, request Impact X-Ray from `code_change_context`. See changed declarations, callers, indirect paths, imports and candidate tests. Select a node or arrow to inspect real source, file/line, provenance and the reason it was included.

Know what remains uncertain: solid `exact` relationships describe structural resolution under the existing index; dashed `import-scoped` relationships retain import-scope evidence; dotted amber `name-only` relationships remain candidates. Unmapped changes, missing source and truncated results are explicit. Test leads do not prove coverage or failure.

English and 简体中文 UI, a bounded graph, an expanded graph/evidence view, native current-file preview and saved-result replay turn the existing change-context analysis into a Desktop workflow. This is not a new impact-analysis algorithm. There are no speed, accuracy or Token-savings claims.

The 30-second recording is genuine `0.11.0-dev.0` MVP footage. First-screen improvements in `dev.1` are documented separately with real Desktop screenshots. DSH Desktop 0.2.1-rc.2 received full UI verification; 0.2.0-rc.2 passed install and ToolRuntime checks, while its full X-Ray UI remains unvalidated. See [actual Desktop footage](impact-xray-mvp-demo.md), [release notes](../RELEASE_NOTES_v0.11.0.md) and [release evidence](../RELEASE_EVIDENCE_v0.11.0.md).

---

# Impact X-Ray — v0.11.0

**在 AI 修改代码前，看清潜在影响范围。**

通过 `code_change_context` 请求 Impact X-Ray，检查变更声明、调用者、间接路径、模块依赖和测试候选。点击节点或箭头，直接查看真实源码、文件行号、关系来源和纳入原因。

了解仍不确定的部分：实线 `exact` 表示既有索引内的结构解析；虚线 `import-scoped` 保留导入范围证据；黄色点线 `name-only` 始终是候选。未映射变更、缺失源码和裁剪结果明确提示。测试线索不证明覆盖率或必然失败。

中英文 UI、有界图、并排图与证据视图、原生当前文件预览及保存结果回放，将既有变更分析能力带入实际 Desktop 工作流。本次不是新的影响分析算法，不作速度、准确率或 Token 节省宣传。

30 秒录屏来自真实 `0.11.0-dev.0` MVP；`dev.1` 首屏改进另有真实 Desktop 截图。DSH Desktop 0.2.1-rc.2 已完成 UI 实机验证；0.2.0-rc.2 通过安装和 ToolRuntime 检查，但未验证完整 X-Ray UI。见[真实 Desktop 演示](impact-xray-mvp-demo.md)、[发布说明](../RELEASE_NOTES_v0.11.0.md)及[发布证据](../RELEASE_EVIDENCE_v0.11.0.md)。
