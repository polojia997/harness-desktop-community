# Harness Desktop

<p align="center">
  <img src="build/icon.png" width="96" alt="Harness Desktop 图标">
</p>

<p align="center">
  由社区开发的非官方 DeepSeek Harness Windows 桌面版。
</p>

<p align="center">
  <a href="README.md">English</a>
  ·
  <a href="https://github.com/polojia997/harness-desktop-community/releases/latest">下载安装</a>
  ·
  <a href="https://github.com/polojia997/harness-desktop-community/issues">反馈问题</a>
</p>

Harness Desktop 会在本机启动固定版本的
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
运行环境，并在经过安全配置的 Electron 窗口中加载原版 Web 界面。桌面层不会重写
或裁剪 Harness 的原有功能。

## 主要功能

- 保留 DeepSeek Harness 原版界面与功能
- 原生 Windows 工作区选择
- Windows 10/11 x64 MSI 安装包
- 独立保存桌面版 Profile 和会话
- 使用随机本地端口运行 Harness
- 启用 Electron 上下文隔离与沙箱
- 不内置任何 API Key、中转站账号或私人配置

当前版本固定使用 `@deepseek-ai/dsh@0.1.1-rc.2`。

## 下载安装

请从
[GitHub Releases](https://github.com/polojia997/harness-desktop-community/releases/latest)
下载最新版 MSI。

安装包目前没有数字签名，Windows 可能显示 Microsoft Defender SmartScreen
提示。安装前可以查看仓库源码以及 Release 中提供的校验信息。

## 首次使用

1. 安装 x64 MSI。
2. 启动 Harness Desktop。
3. 选择一个具体的项目目录作为工作区。
4. 在 Harness 内配置自己的 API 服务商和凭据。

磁盘根目录、用户主目录和系统目录不能作为工作区。API 凭据和会话保存在桌面程序
的用户数据目录中，本项目不会将其提交到仓库。

## 开发

需要 Windows 10/11 x64 和 Node.js 24。

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

## 构建 MSI

```powershell
npm.cmd run build:msi
```

安装包输出到 `release/<版本号>/`。

## 安全

报告安全问题前请阅读 [SECURITY.md](SECURITY.md)。请勿在 Issue 中提供真实
API Key、服务商凭据或私人工作区数据。

## 支持项目

如果这个项目节省了你的时间，可以通过微信支付自愿支持后续开发。

<img src="assets/wechat-pay.jpg" width="320" alt="微信支付赞助二维码">

赞助完全自愿，不代表购买技术支持、保证或额外权利。

## 声明

本项目为独立社区项目，与 DeepSeek 无隶属、官方合作或背书关系。

## 许可证

桌面宿主源码使用 [MIT License](LICENSE)。DeepSeek Harness 及打包依赖继续
保留各自的许可证和版权声明，详见
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
