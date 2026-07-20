# Codex Dream Skin Desktop

这是跨平台控制面板，复用仓库内的 macOS / Windows 换肤运行时，不直接修改 Codex 官方安装文件。

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

## 当前能力

- 读取 macOS 运行状态和当前主题。
- 启动、暂停和恢复 macOS 换肤运行时。
- 在 macOS 面板中导入图片并创建主题。
- Windows 中读取状态、启动、暂停、继续、恢复和导入图片。
- 在两个平台中点击内置主题进行应用。
- 浏览当前平台内置主题预览。
