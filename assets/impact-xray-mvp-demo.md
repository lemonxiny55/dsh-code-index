# Impact X-Ray: actual Desktop recording

![Actual DSH Desktop interaction](impact-xray-mvp.gif)

[30-second MP4](impact-xray-mvp.mp4) · [Poster](impact-xray-mvp-poster.png) · [Media hashes and edit parameters](impact-xray-mvp-media.json) · [Audited tool results](impact-xray-mvp-evidence.json)

Recorded on **2026-10-21**, in actual **DSH Desktop 0.2.1-rc.2**, using this branch's `0.11.0-dev.0` client. The user selected the system recording region and started recording; Computer Use performed the graph clicks and stopped the recording. This is a real app replay of a persisted, independently audited Git-analysis result, not a fabricated card or a live Agent-latency demonstration.

The continuous 30-second excerpt shows:

1. `normalize()` changed from `trim()` to `trim().toUpperCase()`; its real current source and changed declaration are visible.
2. Callers, an indirect caller, test code and all three provenance styles.
3. Selecting `startup → normalize`: `exact`, imported binding, `src/startup.js:2`, actual call-site source.
4. Selecting `checkNormalize → normalize`: the actual test-file call at `tests/core.test.js:4`.
5. Selecting `looseUsage → normalize`: dotted amber `name-only`, a low-confidence repository-name candidate with deliberately unresolved import scope.

The Git edit occurred before analysis/recording. No code was typed into the product during filming. The clip does not claim that every displayed test will fail; the demonstration's separate baseline/current Node test run is recorded in the [validation report](../IMPACT_XRAY_MVP.md).

Only raw seconds **28–58** are included, at normal speed. Processing uses a rectangular crop, scaling, frame-rate/palette conversion and audio removal. No generated UI, inserted source text, overlays or still-image animation is used. The MP4 has 900 frames at 30 fps and no audio; the GIF has 300 frames at 10 fps. The original recording stays in the local ignored validation directory; its SHA256 and the crop rectangle are retained in the media metadata.

## Reproduce

```sh
npm run build
node scripts/impact-xray-demo.mjs /absolute/path/to/a-new-demo-repo
```

The script creates a real Git repository and refuses to overwrite an existing directory. It prints the root, baseline commit and request. In Desktop, ask for one `code_change_context` call with the printed root and `outputFormat: "xray"`. Expand the tool result, choose **Expand view**, then select the declaration and arrows shown above.

The repository contains six JavaScript source/test files plus `package.json`. The baseline test passes. The edited test intentionally fails with `'TEST' !== 'test'`; `looseUsage` is intentionally not a verified executable path. Use a separate baseline checkout if running both test states; do not overwrite the recorded working tree to imitate a passing result.

To process your own genuine capture with an existing ffmpeg binary:

```sh
node scripts/process-impact-xray-demo.mjs INPUT.mp4 START_SECONDS 30 WIDTH:HEIGHT:X:Y
```

Set `FFMPEG` if the executable is not on PATH. The helper produces MP4, GIF, an extracted poster and hash metadata. It does not record or synthesize UI.

## 中文说明

这是 **2026-10-21 真实 DSH Desktop 0.2.1-rc.2** 中的连续操作实录。用户启动系统选区录制，Computer Use 点击实际图中的关系并结束录制。画面回放的是已持久化、经过独立源码核对的真实 Git 分析结果，不是模拟卡片，也不是 Agent 响应速度演示。

30 秒片段依次展示：真实的 `normalize()` 大写转换修改、调用者和测试、`exact` 调用的文件行号及源码、测试文件的实际调用行，以及黄色点线 `name-only` 候选的不确定性。修改发生在分析和录制之前，视频中没有假装现场编辑代码。测试线索不保证测试必然失败；本例测试在独立实测中按设计失败。

素材仅截取原视频第 28–58 秒、正常速度播放，作矩形裁切、缩放、格式转换及去音频；没有生成界面、覆盖源码文字或用静态截图冒充连续录像。复现方法见上方命令及 [MVP 报告](../IMPACT_XRAY_MVP.md)。
