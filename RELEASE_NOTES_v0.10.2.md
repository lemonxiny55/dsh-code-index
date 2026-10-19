# v0.10.2 — Rust declaration display fix / Rust 声明展示修复

Candidate only; not published. / 仅为候选，尚未发布。

## English

Fixes [Issue #5](https://github.com/lemonxiny55/dsh-code-index/issues/5): public Rust structs, enums and traits appeared as `pub` in tool output. Actual Tree-sitter AST fields, symbol names and stable IDs were correct; the signature fallback took the first named child (visibility), and renderers preferred that signature. Rust type signatures now use the declared name. Functions retain their existing parameter signatures.

Cache generation advances from 3 to 4. Old caches are rebuilt from source, including unchanged files; direct incremental builds also reject old generations. Existing correct stable IDs keep their format and value.

`exported` and the generic `export` display marker retain their cross-language public-status meaning. For Rust, unrestricted `pub` is true; ordinary declarations, `pub(crate)` and `pub(in path)` are false. Kind mappings remain struct → class and trait → interface. This patch adds no type-use/struct-literal reference edges: `code_refs` can show a correct type definition with zero callers; actual function calls remain traceable.

DSH tools support remains exactly `0.2.0-rc.2 || 0.2.1-rc.2`; Node 22/24. No ArkTS semantic, UI, vector-search, host or third-party changes. Validation methods and limitations are recorded in [Release Evidence](RELEASE_EVIDENCE_v0.10.2.md). Publication requires a separate authorization.

## 中文

修复 [Issue #5](https://github.com/lemonxiny55/dsh-code-index/issues/5)：公共 Rust struct、enum 和 trait 在工具输出中被显示为 `pub`。实际 Tree-sitter AST 字段、符号名称及稳定 ID 均正确；签名回退误取首个具名子节点（可见性），展示层又优先使用该签名。现在 Rust 类型签名使用声明名称；函数保留原有参数签名。

缓存代次从 3 升至 4。旧缓存从源码重建，包括未变动文件；直接增量构建也拒绝复用旧代次。原本正确的稳定 ID 格式和值保持不变。

`exported` 与通用 `export` 展示标记保留跨语言的公开状态含义。Rust 中不带限制的 `pub` 为 true；普通声明、`pub(crate)` 与 `pub(in path)` 为 false。种类映射仍为 struct → class、trait → interface。本次不新增类型使用或结构体字面量引用边：`code_refs` 可正确显示类型定义，同时 callers 为零；真实函数调用仍可追踪。

DSH tools 支持范围仍严格为 `0.2.0-rc.2 || 0.2.1-rc.2`，Node 22/24。不包含 ArkTS 语义、UI、向量检索、宿主或第三方修改。验证方法与局限见[发布证据](RELEASE_EVIDENCE_v0.10.2.md)。正式发布需另行授权。
