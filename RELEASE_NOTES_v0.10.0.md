# v0.10.0 — ArkTS & Reliable Code Context

**Prepared stable candidate for maintainer review. Unreleased; package: `0.10.0`.**

## English

ArkTS `.ets` sources now have a dedicated, pinned Tree-sitter grammar. Component
structs, methods, fields, decorators and ordinary business declarations feed
symbol search, repo maps, references, change context and bounded Context Packs.
Decorator lines belong to the definition's source range; mixed relative ETS/TS
imports resolve when their targets are statically unique.

UI calls without local/explicit bindings do not acquire unrelated same-named
project targets. Attribute chains and decorators are excluded from runtime call
relationships; default imports retain import-scoped provenance. This does not
implement SDK typing, HAR/module aliases or state-update/rerender semantics.

Lightweight parsed/partial/failed diagnostics report limited issue locations and
index gaps. Unreliable ArkTS declarations are omitted. Older caches rebuild;
source evidence and text/JSON character budgets continue to apply.

Verification: Node 22.23.3/24.19.0 each passed 235 tests, typecheck, builds and
real package-consumer smoke of the same stable tarball. A real Desktop Agent
loaded the installed stable package and completed five successful tool calls:
accurate ETS source ranges, mixed references, honest provenance and strict
5000/500-character budgets. Finite official parser corpus: 22 inputs, zero
ERROR/MISSING. No general
accuracy/performance claim or HarmonyOS compiler/device validation is made.
See [complete evidence and boundaries](RELEASE_EVIDENCE_v0.10.0.md).

## 中文

ArkTS `.ets` 使用独立、版本锁定的 Tree-sitter grammar。组件 struct、方法、字段、装饰器
和普通业务声明接入搜索、仓库地图、引用、变更上下文及有界 Context Pack。装饰器行属于
定义源码范围；目标唯一可确定的相对 ETS/TS import 可以解析。

无本地或显式绑定的 UI 调用不关联无关的同名项目符号；属性链和装饰器不作为运行时调用
关系，默认 import 保留 import-scoped 来源。不实现 SDK 类型、HAR/模块别名或状态更新、
UI 重渲染语义。

轻量 parsed/partial/failed 诊断提供有限位置及索引缺口，不可靠 ArkTS 声明被省略。
旧缓存自动重建，源码证据和文本/JSON 字符预算继续生效。

Node 22.23.3/24.19.0 各通过 235 个测试、typecheck、构建及同一稳定 tarball 的真实安装 smoke。
真实 Desktop Agent 加载稳定安装包，完成 5 次成功工具调用，验证准确 ETS 源码行号、
混合引用、诚实的 provenance 和 5000/500 字符预算。
有限官方解析语料共 22 项，ERROR/MISSING 为零；不宣称整体准确率、性能或鸿蒙编译、
设备运行已经验证。完整方法与限制见 [Release Evidence](RELEASE_EVIDENCE_v0.10.0.md)。
