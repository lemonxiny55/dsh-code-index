# dsh-code-index v0.11.0 — Impact X-Ray

**See the blast radius before your AI edits the code.**

## English

Impact X-Ray presents the existing `code_change_context` analysis in an interactive DSH Desktop view. Start from a real Git diff or an explicitly labeled file/symbol selection. Inspect changed declarations, direct callers, indirect paths, import dependencies and candidate tests. Select a node or relationship to inspect its source, file and line, evidence type, and reason for inclusion.

The view distinguishes `exact`, `import-scoped` and `name-only` relationships and makes missing evidence, unmapped changes and bounded-result truncation visible. Potential impact is not a guarantee of runtime behavior, and a test lead does not prove coverage or failure. The existing `code_change_context` text output and `code_context` Context Packs remain compatible. No new analysis engine, graph framework or runtime dependency was added.

The display is bounded to 32 nodes, 48 relations and 12 paths, with up to eight test and import leads each. These presentation limits do not bound the existing index's memory. Measurements, verification methods and known limits are recorded in the release evidence.

The 30-second GIF/MP4 is continuous footage from the real `0.11.0-dev.0` MVP; it shows the changed function, caller/test lanes and source-backed exact relationship within its opening 10 seconds. The `dev.1` first-screen change-center improvements have separate real DSH Desktop screenshots. The footage was not recreated or relabeled as a recording of the later first screen.

### Install

```sh
dsh plugin --profile desktop add dsh-code-index@0.11.0
```

Restart Desktop after installation. Node 22/24 and pnpm 11 are used for development and verification. DSH Desktop 0.2.1-rc.2 received full Impact X-Ray UI verification. DSH Desktop 0.2.0-rc.2 passed installation and ToolRuntime verification, but its full Impact X-Ray UI was not validated. The existing peer range is unchanged.

### Compatibility and limits

- `exact` describes structural relationships resolved by the existing index; it does not guarantee runtime impact. `import-scoped` retains import-scope evidence. `name-only` is a lower-confidence candidate that should be checked against source.
- The view uses bounded source snapshots. Re-run the analysis after edits; historical source availability is limited. Deleted declarations may use baseline source when available.
- The existing parser and index can consume substantial peak memory on even a small repository. UI bounds limit projection and rendered results, not cold-index cost.
- Static analysis does not resolve dynamic dispatch, infer missing calls, guarantee test coverage, or provide full HarmonyOS SDK semantics, HAR/module-alias resolution, state-update or UI-rerender graphs.

## 中文

**在 AI 修改代码前，看清潜在影响范围。**

Impact X-Ray 将已有 `code_change_context` 分析呈现在可交互的 DSH Desktop 界面中。从真实 Git diff 或明确标注的文件/符号选择开始，查看变更声明、直接调用者、间接路径、导入依赖和测试候选。点击节点或关系可检查源码、文件行号、证据类型及纳入原因。

界面区分 `exact`、`import-scoped` 和 `name-only`，并明确显示证据缺失、未映射变更及有界结果裁剪。潜在影响不等于运行时必然行为；测试线索不证明覆盖或必然失败。现有 `code_change_context` 文本输出和 `code_context` Context Pack 行为保持兼容。本版本没有新增分析引擎、大型图库或运行时依赖。

展示上限为 32 个节点、48 条关系和 12 条路径，测试与导入线索各最多 8 条。这些展示上限不限制既有索引的内存消耗。实测数据、验证方法和已知限制记录在发布证据中。

30 秒 GIF/MP4 是真实 `0.11.0-dev.0` MVP 的连续录屏；前 10 秒可看到变更函数、调用者/测试轨道和有源码证据的 exact 关系。`dev.1` 首屏变更中心改进另有真实 DSH Desktop 截图。录屏没有重制，也没有冒充后续首屏版本的录制。

### 安装

```sh
dsh plugin --profile desktop add dsh-code-index@0.11.0
```

安装后重启 Desktop。开发与验证使用 Node 22/24、pnpm 11。Impact X-Ray 完整 UI 已在 DSH Desktop 0.2.1-rc.2 实机验证。DSH Desktop 0.2.0-rc.2 通过安装和 ToolRuntime 验证，但没有完成完整 Impact X-Ray UI 验收。现有 peer 范围保持不变。

### 兼容范围与限制

- `exact` 表示既有索引解析出的结构关系，不保证运行时必然受影响；`import-scoped` 保留导入范围证据；`name-only` 是置信度较低的候选，应结合源码核实。
- 界面使用有界源码快照。代码编辑后应重新分析；历史源码可用范围有限。删除声明在基线源码可用时可能显示基线内容。
- 即使小型仓库，既有解析器和索引也可能产生较高峰值内存。UI 上限约束投影和渲染结果，不约束冷索引成本。
- 静态分析无法解析动态分发、推断缺失调用或保证测试覆盖，也不提供完整 HarmonyOS SDK 语义、HAR/模块别名解析、状态更新或 UI 重渲染调用图。
