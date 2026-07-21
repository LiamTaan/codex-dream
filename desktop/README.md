# Codex Dream Skin Desktop

这是跨平台控制面板，复用仓库内的 macOS / Windows 换肤运行时，不直接修改 Codex 官方安装文件。

## 下载安装

从 [GitHub Releases](https://github.com/LiamTaan/codex-dream/releases/latest) 下载当前平台的安装包：

- macOS：Apple Silicon 下载文件名带 `arm64` 的 `.dmg`，Intel Mac 下载文件名不带 `arm64` 的 `.dmg`。打开后将 `Codex Dream Skin` 拖入“应用程序”。当前构建未做 Apple 公证；首次打开若被系统拦截，请在“系统设置 → 隐私与安全性”中确认打开。
- Windows：下载 `.exe` 安装程序并按提示安装。Windows 运行时当前还要求系统已安装 Node.js 22 或更高版本。

启动应用后点击“安装运行时”，等待状态变为“运行时已就绪”，再选择预设或导入自己的背景图。应用只把换肤运行时安装到用户目录，不修改 Codex 官方应用文件。

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

推送 `v*` 标签会触发 `.github/workflows/release.yml`，自动构建两个平台并发布 GitHub Release。也可以手动运行该工作流并填写一个已经存在的版本标签。

## 当前能力

- 读取 macOS 运行状态和当前主题。
- 启动、暂停和恢复 macOS 换肤运行时。
- 在 macOS 面板中导入图片并创建主题。
- Windows 中读取状态、启动、暂停、继续、恢复和导入图片。
- 在两个平台中点击内置主题进行应用。
- 浏览当前平台内置主题预览。
