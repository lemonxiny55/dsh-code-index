# v0.11.0 release notes — unpublished candidate

**Development candidate: `0.11.0-dev.1`. This prepares the future v0.11.0 release; it does not announce a published version.**

## English

**See the blast radius before your AI edits the code.**

Impact X-Ray presents existing `code_change_context` analysis in an interactive English / 简体中文 Desktop view. Start with a real Git diff, inspect changed declarations, callers, indirect paths, import dependencies and candidate tests, then select a node or arrow to inspect actual source, file/line and the inclusion reason.

The first screen highlights the change center, counts relations in the bounded snapshot, and calls out name-only candidates and unmapped changes. Solid `exact`, dashed `import-scoped` and dotted amber `name-only` retain their original semantics. Native preview, selection history, filters, local expansion and saved-result replay help inspect evidence. Potential relationships do not guarantee runtime impact; test leads do not prove coverage or failure.

No new analysis engine, graph framework or runtime dependencies. Default tool text and `code_context` Context Packs retain their behavior. UI bounds are 32 nodes / 48 relations / 12 paths with explicit truncation and missing evidence; they do not bound the underlying index's memory. Source snapshots can become stale after edits.

### Install the development candidate

Use Node 22/24 and pnpm 11. Build this branch, pack locally, then install into an existing supported Desktop profile with its bundled CLI:

```sh
pnpm install --frozen-lockfile
npm run build
npm pack --ignore-scripts
dsh plugin --profile desktop add /absolute/path/to/dsh-code-index-0.11.0-dev.1.tgz
```

Keep a backup and restart Desktop. Only matching DSH/dsh-tools `0.2.0-rc.2` or `0.2.1-rc.2` groups are declared; the range is unchanged. The RC report states the verification method and remaining old-Desktop UI limitation. Published v0.10.2 remains the baseline and does not include X-Ray.

After a separately authorized v0.11.0 publication, the intended public install command will be `dsh plugin --profile desktop add dsh-code-index@0.11.0`. Do not use that version as though it were already published; install the local candidate above during review.

Ask for `code_change_context` with `{"repoRoot":"/absolute/repo","outputFormat":"xray"}`, expand the result and choose **Expand view**. Select an arrow to inspect its source. The original text remains available.

The README's 30-second recording is real Desktop footage of the audited `0.11.0-dev.0` MVP. This candidate refines the header while preserving those interactions and analysis. It is not a performance or live Agent-latency demonstration.

## 中文

**在 AI 修改代码前，看清潜在影响范围。**

Impact X-Ray 将已有 `code_change_context` 分析转成中英双语 Desktop 交互视图。从真实 Git diff 开始，检查变更声明、调用者、间接路径、导入依赖和测试候选；点击节点或箭头查看实际源码、文件行号、来源及纳入原因。

首屏突出变更中心、有界快照的关系数量、仅名称候选和未映射变更。`exact` 实线、`import-scoped` 虚线及 `name-only` 黄色点线保留原始含义，不将潜在关系包装为必然影响。支持原生文件预览、选择历史、筛选、本地展开和已保存结果回放。

没有新增分析引擎、大型图库或运行时依赖。默认工具文本与 Context Pack 行为兼容。展示上限为 32 节点、48 关系、12 路径，裁剪与缺失证据明确提示；它不限制底层索引内存。修改工作区后应重新请求证据快照，测试线索不证明覆盖或必然失败。

当前仅为**未发布的 `0.11.0-dev.1` 候选包**，安装步骤见上方；正式发布另需授权。兼容范围保持两个精确的 DSH/dsh-tools RC 组，实测方式及旧版 UI 风险见 RC 报告。README 中的 30 秒素材来自真实 `dev.0` MVP；本候选版改进首屏，保留相同交互与分析语义。

单独授权并正式发布 v0.11.0 后，公共安装命令计划为 `dsh plugin --profile desktop add dsh-code-index@0.11.0`；当前不能把该版本当成已发布版本使用。

本轮不发布 npm、不创建 tag/Release、不合并 main；PR 保持 Draft。
