# Codex Dream Skin Desktop

这是跨平台控制面板，复用仓库内的 macOS / Windows 换肤运行时，不直接修改 Codex 官方安装文件。

## 下载安装

从 [GitHub Releases](https://github.com/LiamTaan/codex-dream/releases/latest) 下载当前平台的安装包：

- macOS：Apple Silicon 下载文件名带 `arm64` 的 `.dmg`，Intel Mac 下载文件名不带 `arm64` 的 `.dmg`。打开后将 `Codex Dream Skin` 拖入“应用程序”。安装包会进行完整 ad-hoc bundle 签名并在发布时严格校验，但尚未做 Apple Developer ID 签名和 Apple 公证；首次打开可能提示“无法验证开发者”，请在“系统设置 → 隐私与安全性”中确认打开。正常情况下不应再显示“应用已损坏”。
- Windows：下载 `.exe` 安装程序并按提示安装。Windows 运行时当前还要求系统已安装 Node.js 22 或更高版本。

启动应用后点击“安装运行时”。如果 Codex 正在运行，桌面应用会先说明原因，并在你确认后安全关闭 Codex再继续。等待状态变为“运行时已就绪”，即可选择预设或导入自己的背景图。应用只把换肤运行时安装到用户目录，不修改 Codex 官方应用文件。

## 开发运行

在本目录执行：

```bash
npm install
npm start
```

`npm start` 会根据当前系统调用对应平台的脚本：macOS 使用 Shell/Node.js，Windows 使用 PowerShell/Node.js。

首次启动时点击“安装运行时”。桌面应用会把内置的平台运行时安装到用户目录，之后所有操作都调用受管副本。macOS 使用 Codex 自带的签名 Node.js；Windows 当前要求系统安装 Node.js 22 或更高版本。

## 构建

```bash
npm run dist:mac
npm run dist:win
```

macOS 构建输出 ZIP/DMG，Windows 构建输出安装程序和 ZIP。Windows 安装包应在 GitHub Actions 的 Windows Runner 上构建。

macOS 在没有 Developer ID 证书时会对完整 `.app` 进行 ad-hoc 签名。发布工作流还会重新挂载最终 DMG，校验签名封装、Bundle ID 和 arm64/x64 架构，任何检查失败都会阻止发布。

推送 `v*` 标签会触发 `.github/workflows/release.yml`，自动构建两个平台并发布 GitHub Release。也可以手动运行该工作流并填写一个已经存在的版本标签。

## 当前能力

- 安装前检查 Codex、Node.js 和现有运行时状态，失败后可以继续安装。
- 查看皮肤会话、Codex 进程、CDP 端口和当前主题。
- 启动、暂停、继续以及恢复官方外观。
- 浏览并筛选内置主题和用户创建的主题。
- 导入图片并设置主题名称、明暗适配、安全区和任务页显示模式。
- 用摘要和诊断详情分层展示错误，不在主题区堆叠原始命令行。
