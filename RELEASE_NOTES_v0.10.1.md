# v0.10.1 — DSH Desktop compatibility fix / Desktop 兼容修复

Released on 2026-10-18; npm `latest` is `0.10.1`.
已于 2026-10-18 正式发布；npm `latest` 为 `0.10.1`。

## English

DSH Desktop `0.2.1-rc.2` rejects v0.10.0 before activation because its
`@deepseek-ai/dsh-tools` peer is pinned to `0.2.0-rc.2`. v0.10.1 explicitly
supports `0.2.0-rc.2 || 0.2.1-rc.2`, keeping each DSH first-party host group on
one matching RC. Other versions are outside this declaration. No version
exemption, Host patch or third-party extension patch is required.

The tool definition/registration/execution/output contracts used by this plugin
remain compatible. Settings and client tool-card contracts were compared against
the actual RC packages and Desktop installation. No production TypeScript,
ArkTS grammar, WASM, license or dependency-lockfile change is needed. Existing
ArkTS limitations remain: syntax/static navigation only, without full HarmonyOS
SDK semantics, HAR/module aliases or state-update/UI rerender analysis.

Install the released package with the Desktop-bundled CLI, then restart Desktop:

```sh
dsh plugin --profile desktop add dsh-code-index@0.10.1
```

The [npm package](https://www.npmjs.com/package/dsh-code-index/v/0.10.1)
is byte-identical to the verified 19-file candidate: SHA256
`4861daae474d1e975a97d5ac0f6240841bd0c253b3b51b013f289c654063207a`.
[PR #4](https://github.com/lemonxiny55/dsh-code-index/pull/4) merged as
`17cfb9796a274d5705fe5cb19964f9226028c370`;
[post-merge main CI](https://github.com/lemonxiny55/dsh-code-index/actions/runs/39095491158)
passed on Node 22/24 (234 tests passed and one existing Windows-only skip on each,
plus typecheck, builds and installation smoke). Both supported RC runtimes passed
local installation smoke on Node 22/24. Actual Desktop 0.2.1-rc.2 activation,
four successful Agent calls, ArkTS/Context Pack source, and required client
presentation were verified. Exact methods and boundaries are in
[Release Evidence](RELEASE_EVIDENCE_v0.10.1.md).

## 中文

DSH Desktop `0.2.1-rc.2` 会在激活前拒绝 v0.10.0，原因是
`@deepseek-ai/dsh-tools` peer 被精确锁定为 `0.2.0-rc.2`。v0.10.1 明确支持
`0.2.0-rc.2 || 0.2.1-rc.2`，每个宿主的第一方包须使用同一组 RC；不声明支持
其他版本。不需要版本豁免，也不需要修改宿主或第三方扩展。

本插件实际使用的工具定义、注册、执行及输出契约兼容；已对照真实 RC 包与
Desktop 安装中的设置及客户端卡片契约。无需修改生产 TypeScript、ArkTS grammar、
WASM、许可证或依赖锁文件。现有 ArkTS 边界保持：仅语法和静态代码导航，不包含
完整 HarmonyOS SDK 语义、HAR／模块别名或状态更新／UI 重渲染分析。

使用上面的 Desktop 自带 CLI 命令安装正式版本，随后重启。
[npm v0.10.1](https://www.npmjs.com/package/dsh-code-index/v/0.10.1) 的实际下载包
与已验证候选的 19 个文件及压缩包字节完全一致，SHA256 见英文段落。
PR #4 已合并至上述发布提交；合并后的 main Node 22/24 CI 均通过，每组 234 项测试
通过、1 项既有 Windows 专用测试跳过，类型检查、构建及安装 smoke 均通过。
两个受支持 RC runtime × 两个 Node 的本地安装 smoke 均通过；真实 Desktop
0.2.1-rc.2 的激活、4 次成功 Agent 调用、ArkTS／Context Pack 源码与必要客户端
展示已验证。精确方法和边界见 [Release Evidence](RELEASE_EVIDENCE_v0.10.1.md)。
