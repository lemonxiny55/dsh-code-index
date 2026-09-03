# dsh-code-index

[English](README.md) | 中文

语义仓库索引 —— 一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)(`dsh`)插件,为 agent 提供**代码库地图**:基于 tree-sitter 的符号索引、带排名的符号搜索,以及注入到系统提示词里的限量自动更新仓库地图。

填补了一个真实的生态缺口:检索 `dsh-plugin` 话题(2026-08)会发现 git/语音/浏览器/记忆类插件琳琅满目,但**缺少原生、模型可用的代码索引 / 仓库地图能力**——也就是 aider 的 repo-map 和 Cursor 的 `@Codebase` 为各自 agent 提供的同类能力。

## 模型能得到什么

| 工具 | 用途 |
|---|---|
| `code_index` | 查看 / (重)建当前工作区的索引 |
| `code_symbols` | 列出符号(函数、类、接口、类型、方法……),带 file:line——支持按名称、路径、类型、是否导出过滤 |
| `code_search` | 排名检索:精确 > 前缀 > 子串 > 子序列模糊,导出优先,带相关度分数与 file:line |
| `code_map` | 限量排名仓库地图(按符号密度 + import 图 PageRank 取核心文件 + 关键符号与行号) |

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

## 支持的语言

TypeScript、JavaScript、Python、Go、Rust、Java(`.ts .tsx .mts .cts .js .jsx .mjs .cjs .py .pyi .go .rs .java`),通过 tree-sitter WASM 解析——纯解析,无需原生编译。符号提供方的接缝(`src/extract.ts` + 语法文件)预留了后续接入其他语言/嵌入检索的位置。

## 工作原理

- **索引构建**(`src/buildIndex.ts`):递归扫描(应用排除规则),逐文件 tree-sitter 提取(`src/extract.ts`),JSON 缓存置于 `<repo>/.dsh-code-index/`,按 mtime 增量刷新(只有被改动的文件才重新解析)。
- **搜索**(`src/search.ts`):纯打分——精确 `1` / 前缀 `0.8` / 子串 `0.5`,导出加权,名称序平局裁决。
- **仓库地图**(`src/repomap.ts`):import 图上的个性化 PageRank(传送向量 = 各文件密度份额,被其他枢纽文件引用的枢纽会比平铺入度统计排得更靠前),以密度感知的文件打分为底(class/interface/function 加权,测试路径衰减),取 Top-N 文件,每文件符号上限,硬截断。
- **工作区解析**:每个工具解析会话 cwd(`agent.session.header.cwd`)并向上查找最近的 `.git`(有界——没有仓库标记的目录绝不会被索引)。

## 已知限制

- **web-tree-sitter 固定为 `^0.20.8`** —— 新版本期望 dylink 语法的 wasm,而 `tree-sitter-wasms` 提供静态构建;此组合在 Node ≥ 22/24 下验证可用。
- 自动注入段针对**默认工作区**(启动目录,与 headless/CLI 模式一致)。多工作区 Web UI 会话应使用 `code_map`/`code_symbols`(它们按会话 cwd 解析)。
- 局部变量也会被索引——召回优先于精确;`code_search` 的排名会压低它们。
- 开发者预览版 harness:上游 harness/插件 API 大概率有破坏性变更。

## 开发

```sh
pnpm install
pnpm test        # vitest —— 提取器、扫描、缓存、搜索、仓库地图
pnpm typecheck
pnpm build       # tsup → dist/index.js(ESM,外部依赖)
```

## 反馈

发现 bug,或者地图排名不合理?请[提 issue](https://github.com/lemonxiny55/dsh-code-index/issues)——真实使用报告(排名失准的仓库、想支持的语言)直接决定路线图。

## 许可证

MIT。与 DeepSeek 无关;基于公开的 `dsh` 插件接口构建。