# dsh-code-index

[English](README.md) | 中文

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh`) 的结构化上下文引擎:本地运行、无需外部服务和 API key,基于 tree-sitter 提供符号索引、排名搜索、仓库地图、调用图和变更感知上下文。

在一个生态姗姗来迟的细分领域占位:git/语音/浏览器/记忆类插件之外,代码智能方向的插件已陆续出现(图谱路线、向量嵌入路线),而本插件刻意保持**零外部依赖**——纯进程内 tree-sitter WASM,把 aider repo-map / Cursor `@Codebase` 的同类能力带给 dsh agent。

## 模型能得到什么

| 工具 | 用途 |
|---|---|
| `code_index` | 查看 / (重)建当前工作区的索引 |
| `code_symbols` | 列出符号(函数、类、接口、类型、方法……),带 file:line——支持按名称、路径、类型、是否导出过滤 |
| `code_search` | 排名检索:精确 > 前缀 > 子串 > 子序列模糊,导出优先,带相关度分数与 file:line |
| `code_map` | 限量排名仓库地图(按符号密度 + import 图 PageRank 取核心文件 + 关键符号与行号) |
| `code_refs` | 沿调用图追踪符号:callers(谁调用了它)与 callees(它调用了谁),解析到 file:line |
| `code_change_context` | 从工作区或显式 diff 出发,返回变更符号、调用者、import 依赖、有限影响路径和可能受影响的测试 |
| `code_health` | 可选开启(`codeHealth: true`):环依赖(import 环)与孤儿模块 |

外加一个可选的**自动注入系统提示词段**(`code-index:repo-map`,序 60):默认工作区的精简排名地图,按 TTL 自动刷新(`mapTtlMs`,默认 60 秒)。将 `autoInject: false` 可关闭,只依赖 `code_map` 工具。

## 安装

需要 `dsh`(任意安装方式——npx、npm 或源码)与 Node ≥ 22。

```sh
# 从 npm(预编译)
npx @deepseek-ai/dsh plugin --profile web add dsh-code-index

# 或从包含本仓库检查副本的目录
npx @deepseek-ai/dsh plugin --profile web add ./dsh-code-index
```

重启 Web UI(`npx @deepseek-ai/dsh web`)——启动日志会确认每个工具:

```
[dsh-code-index] plugin loaded
[dsh-code-index] registered tool: code_index
...
```

不启动即可核对组合配置:`dsh --profile web --dump-config`。

## 使用

在工作区会话中,向 agent 提这类请求:

- "我们现在在哪个仓库?先跑 code_map。"
- "找出所有名字含 `parse` 的函数及其位置。"
- "列出 src/core 里的导出符号。"
- "重建代码索引。"
- "工作区改了什么、谁调用了它、哪些测试可能受影响?"

*索引*本身不需要 API key;模型当然要配置好才能调用这些工具。

## 示例(输入 → 输出)

用户提示:

> 我们现在在哪个仓库?先跑 `code_map`,然后找出 `extractSymbols` 定义在哪。

agent 依次调用工具:

```
code_map
# repo map
## src/extract.ts (14)
  function extractSymbols(code, id) :121
  function languageForFile(filePath) :37
  ...

code_search { query: "extractSymbols" }
export function extractSymbols(code, id) — src/extract.ts:121
```

索引在首次使用时惰性构建;后续调用由磁盘缓存提供,并按 mtime 增量刷新。

### 调用图

`code_refs` 沿调用图追踪符号——下例直接跑在本仓库自身(`getIndex` 定义于 `src/tools.ts:105`,有 7 个调用点,其 callee 解析到 `src/tools.ts:74`):

![在本仓库上运行 code_refs:定义、7 个带所属函数的调用点,以及解析到 file:line 的 callees](assets/code-refs-demo.png)

### 变更感知上下文

`code_change_context` 默认分析相对于 `HEAD` 的当前 Git 工作区,也支持内联 unified diff、仓库相对 `files` 或稳定的 `symbols` ID。结果有数量和字符预算,每条推导关系都会标注 `exact`、`import-scoped` 或 `name-only` 来源。删除和重命名在可用时读取 baseline;工作区模式也会包含未被忽略的未跟踪源码文件。

## 配置

选项通过插件行的 `config` 在 profile 补丁中传入(缺省时使用默认值):

```yaml
# $DSH_HOME/profiles/<name>/cordis.patch.yml —— 裸行按 id 覆盖。
- id: code-index
  config:
    excludeDirs: [generated, playground]
    mapTopFiles: 30
    mapMaxChars: 4000
    autoInject: true
```

| 键 | 默认 | 含义 |
|---|---|---|
| `excludeDirs` | `[]` | 追加到内置排除列表(`node_modules`、`.git`、`dist`、`build`、`out`、`coverage`、`.next`、`.nuxt`、`.cache`、`target`、`vendor`……)之外的额外目录 |
| `mapTopFiles` | `24` | 排名地图中的最大文件数 |
| `mapMaxChars` | `3200` | 渲染地图的硬性字符上限 |
| `mapTtlMs` | `60000` | 自动注入地图的刷新间隔(毫秒,最小 1000) |
| `autoInject` | `true` | 是否注册系统提示词段 |
| `codeHealth` | `false` | 是否注册 `code_health` 工具(环/孤儿模块) |

## 支持的语言

TypeScript、JavaScript、Python、Go、Rust、Java、C++、C(`.ts .tsx .mts .cts .js .jsx .mjs .cjs .py .pyi .go .rs .java .cpp .cc .cxx .c++ .hpp .hxx .hh .h .ipp .tpp .inl .c`),通过 tree-sitter WASM 解析——纯解析,无需原生编译。符号提供方的接缝(`src/extract.ts` + 语法文件)预留了后续接入其他语言/嵌入检索的位置。C/C++ 符号提取通过 declarator 链解析名字(模板、`ns::name` 限定定义、类内方法),`#include "…"` 会接入 repo map 的引用图。

## 工作原理

- **索引构建**(`src/buildIndex.ts`):递归扫描(应用排除规则),逐文件 tree-sitter 提取(`src/extract.ts`),JSON 缓存置于 `<repo>/.dsh-code-index/`,按 mtime 增量刷新(只有被改动的文件才重新解析)。
- **搜索**(`src/search.ts`):纯打分——精确 `1` / 前缀 `0.8` / 子串 `0.5`,导出加权,名称序平局裁决。
- **仓库地图**(`src/repomap.ts`):import 图上的个性化 PageRank(传送向量 = 各文件密度份额,被其他枢纽文件引用的枢纽会比平铺入度统计排得更靠前),以密度感知的文件打分为底(class/interface/function 加权,测试路径衰减),取 Top-N 文件,每文件符号上限,硬截断。
- **调用图**(`src/refgraph.ts`):逐文件提取调用点(按语言,并记录其所属函数),按名称解析成 callers 与 callees——`code_refs` 直接暴露,`code_search` 也把调用热度作为排名平局裁决。
- **变更上下文**(`src/change-context.ts`):把 Git hunk 映射到稳定符号,再在有限深度内追踪带来源标签的调用者、import 依赖、入口路径、影响范围和可能受影响的测试,避免返回整个仓库。
- **健康检查**(`src/health.ts`):对 import 图跑 Tarjan SCC 得到环依赖;孤儿模块检测列出既不被 import、也不 import 任何文件的含符号文件(排除入口与测试)。
- **工作区解析**:每个工具解析会话 cwd(`agent.session.header.cwd`)并向上查找最近的 `.git`(有界——没有仓库标记的目录绝不会被索引)。

## 已知限制

- **web-tree-sitter 固定为 `^0.25`(ESM)** —— 0.25 采用 ESM 具名导出(`Language`/`Query`);与 `tree-sitter-wasms` 静态构建的组合在 Node ≥ 22/24 下验证可用。
- 自动注入段针对**默认工作区**(启动目录,与 headless/CLI 模式一致)。多工作区 Web UI 会话应使用 `code_map`/`code_symbols`(它们按会话 cwd 解析)。
- 局部变量也会被索引——召回优先于精确;`code_search` 的排名会压低它们。
- 开发者预览版 harness:上游 harness/插件 API 大概率有破坏性变更。

## 开发

```sh
pnpm install
pnpm test        # vitest —— 提取器、扫描、缓存、搜索、仓库地图、调用图、健康检查
pnpm typecheck
pnpm build       # tsup → dist/index.js(ESM,外部依赖)
pnpm build && pnpm release:smoke # 打包、干净安装 tarball、启动插件并调用核心工具
```

`bench/` 下的 benchmark 对比 stock DSH、已发布的 0.5 基线和本地 0.6 处理组,记录任务完成、输入 token、工具调用、轮次和墙钟时间; provider 未提供的 usage 会保留为 null,不会伪造性能数据。当前仓库提供基础设施和示例任务,不宣称已测得性能提升。

**WSL → Windows 检出**:从 WSL 对 `/mnt/c` 下的检出跑 `pnpm install`,会留下 Windows 侧 Node 无法穿透的 Linux 风格符号链接(`Cannot find package 'web-tree-sitter'`、`EACCES`)。无需重装,在 Windows 侧跑一次修复:

```sh
node.exe scripts\fix-wsl-links.mjs            # 本仓库的 node_modules
node.exe scripts\fix-wsl-links.mjs C:\Users\you\.dsh\profiles\web   # dsh profile 里的插件安装
```

它会把每个失效链接以 junction 形式重新指向 `.pnpm` store 里的真实位置;可重复执行(幂等,干净时报 `fixed: 0`)。

## 反馈

发现 bug,或者地图排名不合理?请[提 issue](https://github.com/lemonxiny55/dsh-code-index/issues)——真实使用报告(排名失准的仓库、想支持的语言)直接决定路线图。

## 许可证

MIT。与 DeepSeek 无关;基于公开的 `dsh` 插件接口构建。
