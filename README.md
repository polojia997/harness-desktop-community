# Harness Desktop

<p align="center">
  <img src="build/icon.png" width="96" alt="Harness Desktop icon">
</p>

<p align="center">
  An unofficial community-built Windows desktop edition of DeepSeek Harness.
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a>
  ·
  <a href="https://github.com/polojia997/harness-desktop-community/releases/latest">Download</a>
  ·
  <a href="https://github.com/polojia997/harness-desktop-community/issues">Issues</a>
</p>

Harness Desktop starts the pinned upstream
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) runtime
locally and loads its original web interface in a secured Electron window.
The desktop layer does not replace or reimplement Harness features.

## Highlights

- Original DeepSeek Harness interface and functionality
- Native Windows workspace selection
- Windows 10/11 x64 MSI installer
- Isolated desktop profiles and sessions
- Random local runtime port
- Electron context isolation and sandboxing
- No bundled API keys, providers, accounts, or private configuration

The current release pins `@deepseek-ai/dsh@0.1.1-rc.2`.

## Download

Download the newest MSI from
[GitHub Releases](https://github.com/polojia997/harness-desktop-community/releases/latest).

The installer is currently unsigned. Windows may display a Microsoft Defender
SmartScreen warning. Review the repository and release checksums before
installing.

## First Run

1. Install the x64 MSI.
2. Start Harness Desktop.
3. Select a specific project directory as the workspace.
4. Configure your API provider and credentials inside Harness.

Drive roots, the user home directory, and system directories are rejected as
workspaces. Credentials and sessions are stored in the desktop application's
user-data directory and are never committed by this project.

## Development

Requirements:

- Windows 10 or Windows 11, x64
- Node.js 24

```powershell
npm.cmd install
npm.cmd test
npm.cmd start
```

## Build MSI

```powershell
npm.cmd run build:msi
```

The MSI is written to `release/<version>/`.

## Security

Please read [SECURITY.md](SECURITY.md) before reporting a vulnerability. Never
include real API keys, provider credentials, or private workspace data in an
issue.

## Support the Project

If Harness Desktop saves you time, you can support its continued development
through WeChat Pay.

<img src="assets/wechat-pay.jpg" width="320" alt="WeChat Pay support QR code">

Support is voluntary and does not purchase support commitments, warranties, or
additional rights.

## Disclaimer

This is an independent community project. It is not affiliated with, endorsed
by, or an official product of DeepSeek.

## License

The desktop host source code is licensed under the [MIT License](LICENSE).
DeepSeek Harness and bundled dependencies retain their respective licenses and
copyright notices. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
