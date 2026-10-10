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
