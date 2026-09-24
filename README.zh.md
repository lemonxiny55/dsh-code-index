# dsh-code-index

[English](README.md) | 中文

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh`) Agent 始终拿到**新鲜、隔离的当前仓库代码上下文**。在多个仓库间切换时,符号和 Git 变更各自独立;从 DSH 外部新增、修改或删除文件后,后续查询会自动看到变化,无需手动重建。

索引通过 tree-sitter 在本地运行,不依赖 embedding 服务、向量数据库或额外的索引 API key。

## 本页导航

- [🚀 快速开始](#快速开始)
- [🧭 项目隔离与实时更新](#项目隔离与实时更新)
- [👀 实际效果](#实际效果)
- [🧰 工具一览](#工具一览)
- [配置](#配置)
- [支持的语言](#支持的语言)
- [工作原理](#工作原理)
- [已知限制](#已知限制)

## 快速开始

需要 `dsh` 和 Node ≥ 22。在 Web profile 中安装已发布的插件:

```sh
npx @deepseek-ai/dsh plugin --profile web add dsh-code-index
```

运行 `npx @deepseek-ai/dsh web` 重启 Web UI。本地检出安装、兼容信息和启动检查见[安装说明](#安装)。

## 项目隔离与实时更新

```text
打开仓库 A → 搜索到 A 的符号
切换到仓库 B → 搜索到 B 的符号,不会混入 A
从 DSH 外部修改文件 → 下一次查询看到变化
切回 A → A 的上下文仍然独立
```

每个 Git worktree 都有独立索引和变更状态。插件会监听会话访问过的项目,并在工具调用时检查文件元数据,因此新增、修改和删除都会自动反映到后续查询,无需手动重建。

## 实际效果

提问:“我们现在在哪个仓库?先跑 `code_map`,再找出 `extractSymbols` 定义在哪。”

```text
code_map → 排名靠前的文件与关键符号
code_search("extractSymbols") → src/extract.ts:121
```

同一索引还能追踪 callers 和 callees:

![在 dsh-code-index 上运行 code_refs:定义、调用者与被调用者均解析到 file:line](assets/code-refs-demo.png)

## 工具一览

| 工具 | 用途 |
|---|---|
| `code_index` | 查看 / (重)建当前工作区的索引 |
| `code_symbols` | 列出符号(函数、类、接口、类型、方法……),带 file:line——支持按名称、路径、类型、是否导出过滤 |
| `code_search` | 排名检索:精确 > 前缀 > 子串 > 子序列模糊,导出优先,带相关度分数与 file:line |
| `code_map` | 限量排名仓库地图(按符号密度 + import 图 PageRank 取核心文件 + 关键符号与行号) |
| `code_refs` | 沿调用图追踪符号:callers(谁调用了它)与 callees(它调用了谁),解析到 file:line |
| `code_change_context` | 从工作区或显式 diff 出发,返回变更符号、调用者、import 依赖、有限影响路径和可能受影响的测试 |
| `code_context` | 任务感知的统一入口:根据自然语言任务组合搜索、仓库地图、调用/import 图、变更上下文、测试和字符预算 |
| `code_health` | 可选开启(`codeHealth: true`):环依赖(import 环)与孤儿模块 |

外加一个可选的**自动注入系统提示词段**(`code-index:repo-map`,序 60):自动选择当前 DSH 会话工作区的精简排名地图。将 `autoInject: false` 可关闭,只依赖 `code_map` 工具。

## 安装

需要 `dsh`(任意安装方式——npx、npm 或源码)与 Node ≥ 22。

当前开发兼容目标为 `@deepseek-ai/dsh@0.1.7-alpha.2` / `@deepseek-ai/dsh-tools@0.1.7-alpha.2`(CI 覆盖 Node 22 和 24)。DSH 插件接口仍属于预览 API,上游变化可能需要更新兼容适配。

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
- "修复启动时重复加载配置。"(路由器会自动选择最有用的最小上下文)

*索引*本身不需要 API key;模型当然要配置好才能调用这些工具。

## 更多能力

索引在首次使用时惰性构建;后续调用由磁盘缓存提供,并按 mtime 增量刷新。

### 调用图

`code_refs` 沿调用图追踪符号——下例直接跑在本仓库自身(`getIndex` 定义于 `src/tools.ts:105`,有 7 个调用点,其 callee 解析到 `src/tools.ts:74`):

上方截图展示了定义、调用者和被调用者如何解析到 file:line。

### 变更感知上下文

`code_change_context` 默认分析相对于 `HEAD` 的当前 Git 工作区,也支持内联 unified diff、仓库相对 `files` 或稳定的 `symbols` ID。结果有数量和字符预算,每条推导关系都会标注 `exact`、`import-scoped` 或 `name-only` 来源。删除和重命名在可用时读取 baseline;工作区模式也会包含未被忽略的未跟踪源码文件。

### 任务感知上下文

`code_context` 是 Agent 面对“代码任务”而不是单个符号时的高级入口。确定性的路由器识别修改、符号、架构、测试、探索和模糊任务,然后把已有能力合并、排序、去重并限制在字符预算内。只传 `task` 即可,也可以覆盖 `budgetChars`、`maxFiles`、`maxSymbols`。它不调用外部模型/API,推导关系的 `exact`、`import-scoped`、`name-only` provenance 会继续保留。

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
    toolSurface: full
```

| 键 | 默认 | 含义 |
|---|---|---|
| `excludeDirs` | `[]` | 追加到内置排除列表的目录名,按路径组件精确匹配;不支持 `secrets/**` 这类 glob |
| `mapTopFiles` | `24` | 排名地图中的最大文件数 |
| `mapMaxChars` | `3200` | 渲染地图的硬性字符上限 |
| `mapTtlMs` | `60000` | 自动注入地图的刷新间隔(毫秒,最小 1000) |
| `autoInject` | `true` | 是否注册系统提示词段 |
| `codeHealth` | `false` | 是否注册 `code_health` 工具(环/孤儿模块) |
| `toolSurface` | `full` | 实验性的 `compact` 模式只暴露 `code_index`、`code_context` 和已启用的 `code_health`; `full` 保持全部工具 |
| `externalWatch` | `true` | 监听当前活动项目的外部源码变更 |
| `watchDebounceMs` | `120` | 合并文件事件后再刷新受影响文件(最小 20 毫秒) |

## 支持的语言

TypeScript、JavaScript、Python、Go、Rust、Java、C++、C(`.ts .tsx .mts .cts .js .jsx .mjs .cjs .py .pyi .go .rs .java .cpp .cc .cxx .c++ .hpp .hxx .hh .h .ipp .tpp .inl .c`),通过 tree-sitter WASM 解析——纯解析,无需原生编译。符号提供方的接缝(`src/extract.ts` + 语法文件)预留了后续接入其他语言/嵌入检索的位置。C/C++ 符号提取通过 declarator 链解析名字(模板、`ns::name` 限定定义、类内方法),`#include "…"` 会接入 repo map 的引用图。

## 工作原理

- **索引构建**(`src/buildIndex.ts`):递归扫描(应用排除规则),逐文件 tree-sitter 提取(`src/extract.ts`),JSON 缓存置于 `<repo>/.dsh-code-index/`,按 mtime 增量刷新(只有被改动的文件才重新解析)。
- **搜索**(`src/search.ts`):纯打分——精确 `1` / 前缀 `0.8` / 子串 `0.5`,导出加权,名称序平局裁决。
- **仓库地图**(`src/repomap.ts`):import 图上的个性化 PageRank(传送向量 = 各文件密度份额,被其他枢纽文件引用的枢纽会比平铺入度统计排得更靠前),以密度感知的文件打分为底(class/interface/function 加权,测试路径衰减),取 Top-N 文件,每文件符号上限,硬截断。
- **调用图**(`src/refgraph.ts`):逐文件提取调用点(按语言,并记录其所属函数),按名称解析成 callers 与 callees——`code_refs` 直接暴露,`code_search` 也把调用热度作为排名平局裁决。
- **变更上下文**(`src/change-context.ts`):把 Git hunk 映射到稳定符号,再在有限深度内追踪带来源标签的调用者、import 依赖、入口路径、影响范围和可能受影响的测试,避免返回整个仓库。
- **任务感知上下文**(`src/context.ts`):确定性地把任务路由到已有的搜索、地图、调用图、变更上下文和测试信号,再按统一优先级去重并限制字符预算。
- **健康检查**(`src/health.ts`):对 import 图跑 Tarjan SCC 得到环依赖;孤儿模块检测列出既不被 import、也不 import 任何文件的含符号文件(排除入口与测试)。
- **工作区解析**:每个工具解析会话 cwd(`agent.session.header.cwd`)并向上查找最近的 `.git`(有界——没有仓库标记的目录绝不会被索引)。
- **项目上下文**(`src/repo-context.ts`):用真实规范路径区分各 worktree,最多保留四个上下文。每次工具调用扫描文件元数据并只重解析变化文件;watcher 会在有限 debounce 后刷新脏文件。
- **忽略规则**:索引遵守仓库根目录及嵌套 `.gitignore`;`excludeDirs` 仍是精确目录名列表,不支持 glob。

## 已知限制

- **web-tree-sitter 固定为 `^0.25`(ESM)** —— 0.25 采用 ESM 具名导出(`Language`/`Query`);与 `tree-sitter-wasms` 静态构建的组合在 Node ≥ 22/24 下验证可用。
- 自动注入地图使用 DSH system prompt assembly 提供的当前会话上下文。没有 Agent 的 prompt assembly 会回退到 DSH 进程工作目录。新访问的项目第一次注入可能暂时为空,待索引完成后后续 assembly 会使用项目地图。
- Watcher 只为工具实际访问的项目启动,并随插件卸载清理。设置 `externalWatch: false` 后,每次工具调用仍会扫描元数据以发现常规 mtime 变化。
- 大型 monorepo 每次工具调用仍需要扫描目录元数据。文件解析是增量的,但扫描耗时取决于仓库规模和磁盘速度。
- 局部变量也会被索引——召回优先于精确;`code_search` 的排名会压低它们。

## 开发

```sh
pnpm install
pnpm test        # vitest —— 提取器、扫描、缓存、搜索、仓库地图、调用图、健康检查
pnpm typecheck
pnpm build       # tsup → dist/index.js(ESM,外部依赖)
pnpm build && pnpm release:smoke # 打包、干净安装 tarball、启动插件并调用核心工具
```

`bench/` 下的 benchmark 对比 stock DSH、已发布的 0.5 基线、0.6 变更感知处理组和 0.7 任务感知处理组,记录任务完成、输入 token、工具调用、轮次和墙钟时间; provider 未提供的 usage 会保留为 null,不会伪造性能数据。当前仓库提供基础设施和示例任务,不宣称已测得性能提升。

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

