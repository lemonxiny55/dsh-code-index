# Impact X-Ray — v0.11 development preview

**See the blast radius before your AI edits the code.**

Before AI edits your code, request Impact X-Ray from `code_change_context`. See changed declarations, callers, indirect paths, imports and candidate tests. Select a node or arrow to inspect real source, file/line, provenance and the reason it was included.

Know what remains uncertain: solid `exact` relationships describe structural resolution under the existing index; dashed `import-scoped` relationships retain import-scope evidence; dotted amber `name-only` relationships remain candidates. Unmapped changes, missing source and truncated results are explicit. Test leads do not prove coverage or failure.

English and 简体中文 UI, a bounded graph, an expanded graph/evidence view, native current-file preview and saved-result replay turn the existing change-context analysis into a Desktop workflow. This is not a new impact-analysis algorithm. There are no speed, accuracy or Token-savings claims.

This development branch builds `0.11.0-dev.0`. It is for MVP review, not a published release. See [actual Desktop footage](impact-xray-mvp-demo.md) and [validation boundaries](../IMPACT_XRAY_MVP.md).

---

# Impact X-Ray — v0.11 开发预览

**在 AI 修改代码前，看清潜在影响范围。**

通过 `code_change_context` 请求 Impact X-Ray，检查变更声明、调用者、间接路径、模块依赖和测试候选。点击节点或箭头，直接查看真实源码、文件行号、关系来源和纳入原因。

了解仍不确定的部分：实线 `exact` 表示既有索引内的结构解析；虚线 `import-scoped` 保留导入范围证据；黄色点线 `name-only` 始终是候选。未映射变更、缺失源码和裁剪结果明确提示。测试线索不证明覆盖率或必然失败。

中英文 UI、有界图、并排图与证据视图、原生当前文件预览及保存结果回放，将既有变更分析能力带入实际 Desktop 工作流。本次不是新的影响分析算法，不作速度、准确率或 Token 节省宣传。

当前分支构建 `0.11.0-dev.0`，用于 MVP 审查，尚未正式发布。见[真实 Desktop 演示](impact-xray-mvp-demo.md)及[验证与边界](../IMPACT_XRAY_MVP.md)。
