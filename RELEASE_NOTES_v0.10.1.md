# v0.10.1 — DSH Desktop compatibility fix / Desktop 兼容修复

Candidate only — unpublished. Publication requires maintainer confirmation.
候选版本，尚未发布；等待维护者确认发布。

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

Install the local candidate with the Desktop-bundled CLI, then restart Desktop:

```sh
dsh plugin --profile desktop add /absolute/path/to/dsh-code-index-0.10.1.tgz
```

This is a local candidate installation command, not an announcement that npm
v0.10.1 is available. The immutable archive and exact test methods/results are
recorded in [Release Evidence](RELEASE_EVIDENCE_v0.10.1.md).

## 中文

DSH Desktop `0.2.1-rc.2` 会在激活前拒绝 v0.10.0，原因是
`@deepseek-ai/dsh-tools` peer 被精确锁定为 `0.2.0-rc.2`。v0.10.1 明确支持
`0.2.0-rc.2 || 0.2.1-rc.2`，每个宿主的第一方包须使用同一组 RC；不声明支持
其他版本。不需要版本豁免，也不需要修改宿主或第三方扩展。

本插件实际使用的工具定义、注册、执行及输出契约兼容；已对照真实 RC 包与
Desktop 安装中的设置及客户端卡片契约。无需修改生产 TypeScript、ArkTS grammar、
WASM、许可证或依赖锁文件。现有 ArkTS 边界保持：仅语法和静态代码导航，不包含
完整 HarmonyOS SDK 语义、HAR／模块别名或状态更新／UI 重渲染分析。

使用上面的 Desktop 自带 CLI 命令安装本地候选包，随后重启。此命令不代表
npm v0.10.1 已发布。候选包哈希、验证方法和实际结果见
[Release Evidence](RELEASE_EVIDENCE_v0.10.1.md)。
