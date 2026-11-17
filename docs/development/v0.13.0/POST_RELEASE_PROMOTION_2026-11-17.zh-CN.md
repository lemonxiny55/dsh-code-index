# v0.13.0 发布后文档与首轮推广记录

记录时间：2026-11-17（Asia/Shanghai）。本记录只记录实际观察，不把旧版讨论或反馈归因于 v0.13.0。

## 已实际发送

- 在已有 DSH 插件展示讨论中发布一次[中英文 v0.13.0 更新](https://github.com/deepseek-ai/deepseek-harness/discussions/5623#discussioncomment-19671796)，介绍 Review Brief、静态与候选测试边界，并附 Release / npm 链接。发送前核查全部现有评论及回复，无 v0.13.0 重复内容；首次请求 EOF 后核查未出现，再重试成功。未批量 @ 用户或追问旧 Issue 作者。

## 已合并与待合并

- 正式版 [PR #17](https://github.com/lemonxiny55/dsh-code-index/pull/17) 已合并，Release 和 npm 0.13.0 已发布。
- 中英文 README 同步在 [PR #18](https://github.com/lemonxiny55/dsh-code-index/pull/18)，本记录随该 PR 合并后生效；实际合并与 CI 状态以 PR 页面为准。
- 插件目录 [PR #16170](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/16170) 已创建、记录时尚未合并；只修改自有 YAML 的中英文 description，目录和市场页面刷新以实际合并与上游构建为准。

## 未能访问 / 尚未同步

- npm 网站 HTML 链接的自动 HEAD 检查遇到 TLS/403 限制；公开 registry 的 0.13.0 查询和安装已在[发布验收记录](STABLE_ACCEPTANCE.zh-CN.md)及发布后验收中通过。npm 已发布包内的 README 不会因为 GitHub 文档 PR 更新而改变，仍有 0.12.0 的旧安装提示。
- 独立短视频账户未登录、未代发；不声称现有六张素材是模型 Agent 交互。这些截图是明确标记的 Host API 回放。

## 仅准备文案：短视频简介

**中文：** 跟随一个小示例，从变更函数进入 Review Brief，查看当前源码、静态调用关系、候选测试与证据缺口。候选测试未执行，零静态关系不代表零运行时影响。现有截图是 Host API 回放。

**English:** Follow a small example from a changed function into Review Brief, inspecting current source, static callers, candidate tests and evidence gaps. Tests are not run, and zero static relationships do not prove zero runtime impact. Existing screenshots are Host API replays.

## 收到的真实用户反馈

本次发布前检查的讨论有旧版本历史回复；截至本记录时未观察到针对 v0.13.0 的新用户反馈，不将历史反馈描述为新版反馈。
