# v0.11.1 — DSH 0.2.1-rc.3 compatibility

This patch adds the verified exact `@deepseek-ai/dsh-tools@0.2.1-rc.3` host group. The supported range is now `0.2.0-rc.2 || 0.2.1-rc.2 || 0.2.1-rc.3`; first-party DSH packages must stay on the same version.

All eight tools and Impact X-Ray were checked with real rc.3 Host APIs and the Web UI. Server/client implementation, runtime dependencies, lockfile and the `0.2.0-rc.2` development baseline remain unchanged. The install smoke now defaults to rc.3 and explicitly dispatches `code_health` through the native runtime.

## 中文

此补丁新增经过验证的精确 `@deepseek-ai/dsh-tools@0.2.1-rc.3` 宿主组，保留 `0.2.0-rc.2` 和 `0.2.1-rc.2`。每个宿主的 DSH 第一方包应保持同版，无需兼容豁免。

全部 8 个工具和 Impact X-Ray 已在真实 rc.3 Host API 与 Web UI 中检查。服务端/客户端实现、运行依赖、锁文件和旧版开发 API 基线不变。安装 smoke 默认检查 rc.3，并补充原生运行时的 `code_health` 分派。

See [verification evidence and limits](RELEASE_EVIDENCE_v0.11.1.md) for the exact methods. rc.3 verification uses Host APIs and computer-operated Web interaction, without a model-driven Agent request or an rc.3 Electron Desktop UI claim. Publication remains a separate action.
