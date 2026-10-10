# v0.9.1 — Gitignore directory whitelist fix

## English

Fixes [Issue #2](https://github.com/lemonxiny55/dsh-code-index/issues/2): directory whitelist rules such as `!dir/` could silently omit source trees from the index. Whitelisted functions and source are now accessible through `code_search` and `code_context`.

- Directory matching is consistent across repository scanning and the live watcher.
- Nested `.gitignore` rules apply in precedence order. Files inside an ignored parent directory remain excluded.
- Regression coverage checks source retrieval, related tests, nested rules and external file add/change/delete freshness.
- Existing tool APIs and v0.9 Context Pack behavior are preserved.

Local verification passed on Node 22/24: 220 tests, typecheck, server/client builds and packaged consumer installation. A real DSH Desktop Agent completed 10 successful tool calls across three turns, confirming whitelist retrieval, exclusions, external freshness and Context Pack source/provenance/budget behavior. See [release evidence](https://github.com/lemonxiny55/dsh-code-index/blob/v0.9.1/RELEASE_EVIDENCE_v0.9.1.md) for the recorded methods and limits.

Thank you, @bbskye5008, for the detailed report and reproduction. The existing Chinese/English settings-card contribution credit to @garyschulte remains in the v0.8.0 CHANGELOG history.

Requires Node >=22 and the matching DSH `0.2.0-rc.2` host group. Install [dsh-code-index@0.9.1](https://www.npmjs.com/package/dsh-code-index/v/0.9.1):

```sh
npx @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add dsh-code-index@0.9.1
```

## 中文

修复 [Issue #2](https://github.com/lemonxiny55/dsh-code-index/issues/2)：`!dir/` 等目录白名单规则曾导致部分源码被静默遗漏。白名单中的函数及源码现在可通过 `code_search` 和 `code_context` 正确访问。

- 仓库扫描与实时 watcher 使用一致的目录匹配规则。
- 嵌套 `.gitignore` 按优先级生效；父目录仍被忽略时，其子文件不会被重新包含。
- 回归覆盖源码检索、相关测试、嵌套规则及外部文件增改删后的 freshness。
- 保留现有工具 API 与 v0.9 Context Pack 行为。

Node 22/24 本地验证已通过：220 项测试、typecheck、服务端与客户端构建，以及打包后的 consumer 安装。真实 DSH Desktop Agent 在三轮中完成 10 次成功工具调用，验证白名单检索、排除规则、外部 freshness，以及 Context Pack 的源码、provenance 与预算行为。具体方法及边界见 [release evidence](https://github.com/lemonxiny55/dsh-code-index/blob/v0.9.1/RELEASE_EVIDENCE_v0.9.1.md)。

感谢 @bbskye5008 提供详细报告和复现场景。@garyschulte 对中英文设置卡片的贡献署名继续保留在 v0.8.0 CHANGELOG 历史中。

需要 Node >=22 及匹配的 DSH `0.2.0-rc.2` 宿主版本组。安装命令见上方。

## Publication verification / 发布核验

[GitHub Actions CI](https://github.com/lemonxiny55/dsh-code-index/actions/runs/38038359520) passed on release commit `580dedcc4ee6d9a13ecf823d5e1ca096d2f202bb` for Node 22 and 24, including frozen install, typecheck, tests, builds and packaged-install smoke.

The maintainer completed npm publication interactively. Registry version/latest, SHA1/SHA512 and the downloaded tarball were verified: the npm archive matches the prepared final package byte-for-byte (SHA256 `1C16B72F7F05A73CB71BC4A1864E16434306031279260A96087C9BF011F8A7AB`). Its runtime, declarations, client and scripts match the Desktop-verified RC; only CHANGELOG release wording changed.

发布提交的 Node 22/24 远程 CI 全部通过。维护者已交互式完成 npm 发布；registry 版本、latest、校验值及下载包均已核验，发布包与准备产物字节一致。运行时代码、声明、客户端及脚本与 Desktop 验证的 RC 相同，仅更新了 CHANGELOG 发布文案。
