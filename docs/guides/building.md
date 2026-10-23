# 桌面打包与 GitHub Actions

## 自动构建

`.github/workflows/desktop-build.yml` 在推送 `v*` 版本 tag、向 `main` 提交 PR 或手动运行时构建安装包。版本 tag 的四个平台全部成功后自动发布 GitHub Release。

| 平台 | 架构 | 安装包 |
| --- | --- | --- |
| Windows | x64 | NSIS `.exe`、WiX `.msi` |
| macOS | Apple Silicon arm64 | `.dmg` |
| macOS | Intel x64 | `.dmg` |
| Linux | x64 | `.deb`、`.AppImage` |

每个平台先运行 TypeScript 和前端测试，再进行 Release 构建；通用 Rust 单元测试在 Linux 运行。真实学校接口巡检属于手动忽略测试，不在云端运行。

Windows MSI 使用 `zh-CN` 语言，支持中文产品名称。

工具版本取自 `mise.toml`；前端依赖使用 `bun.lock`，Rust 使用 `Cargo.lock`。Linux 构建安装 WebKitGTK 4.1、GTK 相关开发包和 DBus；凭据保存使用 Secret Service，桌面环境需要可用的 GNOME Keyring 或其他兼容服务。

## 发布版本

同时更新 `package.json`、`src-tauri/tauri.conf.json` 和 `src-tauri/Cargo.toml` 的版本号，提交后推送同版本 tag：

```bash
git push origin main
git tag -a v0.13.0 -m "知行 Campus 0.12.0"
git push origin v0.14.0
```

Tag 与三个版本号必须一致。正式 tag 发布到稳定更新通道；含连字符的版本作为预发布，不覆盖稳定版。PR 仅构建安装包，不使用签名私钥或发布 Release。

## 应用内更新

`tauri-plugin-updater` 从公开仓库的 `releases/latest/download/latest.json` 检查正式版本。Windows 使用 NSIS、macOS 使用应用归档、Linux 使用 AppImage。DEB 安装版通过发布页面下载安装更新。界面入口为 **设置 → 应用更新**，不会自动安装或重启。

`TAURI_SIGNING_PRIVATE_KEY` 已配置为仓库 Actions Secret。私钥在本机 `~/.tauri/zhixing-campus.key`，公钥在 `tauri.conf.json`。后续版本继续使用同一私钥；请备份私钥，避免已安装应用无法验证新版本。签名与平台发布者签名、公证是独立流程。

构建产物由 `scripts/stage-release.ts` 按版本、平台和架构命名。所有平台完成后，Release job 上传安装包与 `.sig`，`scripts/update-manifest.ts` 使用实际上传地址及签名生成 `latest.json`，发布后由应用匿名读取。

## 下载产物

正式版本从 [GitHub Releases](https://github.com/hyskr/zhixing-campus/releases) 下载，无需 GitHub 登录。

打开仓库的 **Actions → Desktop packages → 对应运行 → Artifacts**，下载 `zhixing-campus-平台-运行编号`。产物保留 14 天。

手动启动：

```bash
gh workflow run desktop-build.yml --repo hyskr/zhixing-campus
```

下载某次运行的全部安装包：

```bash
gh run download <run-id> --repo hyskr/zhixing-campus --dir output/ci
```

源码、ONNX 模型、依赖许可证随项目管理；账号密码、登录 Cookie、真实接口报告和本机下载记录不属于构建输入。

## 本机打包

先安装 [Tauri 平台依赖](https://v2.tauri.app/start/prerequisites/)，然后执行：

```bash
mise install
mise run setup
mise run build
```

安装包在 `src-tauri/target/release/bundle/`。CI 显式设置 Rust target，因此产物路径为 `src-tauri/target/<target>/release/bundle/`。

## 签名

macOS 使用 ad-hoc 签名，当前未配置 Apple 开发者签名或公证；Windows 当前未配置发布者代码签名。正式签名配置见 [Tauri macOS](https://v2.tauri.app/distribute/sign/macos/)、[Tauri Windows](https://v2.tauri.app/distribute/sign/windows/)。

## 参考

- [Tauri GitHub Actions](https://v2.tauri.app/distribute/pipelines/github/)
- [tauri-apps/tauri-action](https://github.com/tauri-apps/tauri-action)
- [GitHub 托管运行器](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)

带更新签名的本机打包：

```bash
TAURI_SIGNING_PRIVATE_KEY="$HOME/.tauri/zhixing-campus.key" TAURI_SIGNING_PRIVATE_KEY_PASSWORD='' mise run build
```

不持有签名私钥的贡献者可构建普通安装包：

```bash
mise exec -- bun run tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

## 体积组成与官方建议

0.12.3 前端产物在嵌入应用前共约 31.43 MiB，其中 ONNX 推理 WASM 13.58 MiB、验证码模型 10.40 MiB，PDF Worker 1.21 MiB。这是未按安装包压缩的资源大小，不等同于 DMG、EXE 或 AppImage 体积。

[Tauri 应用大小文档](https://v2.tauri.app/zh-cn/concept/size/) 提供 `strip`、LTO、`codegen-units` 与 `opt-level` 等 Release 配置。优化原生二进制与调整模型、预览器资源分别影响不同部分；本项目保留本地验证码识别和文件预览所需资源。

更新配置遵循 [Tauri Updater 文档](https://v2.tauri.app/zh-cn/plugin/updater/)：`createUpdaterArtifacts`、固定公钥、CI 私钥环境变量、HTTPS 静态清单、平台 URL 与签名、显式下载安装和 Process 插件重启。macOS 构建同时使用 `app,dmg`，生成普通安装包与 `.app.tar.gz` 更新归档。

## 0.13 正式构建优化与托盘

按照 [Tauri 体积文档](https://v2.tauri.app/zh-cn/concept/size/) 配置 `codegen-units = 1`、`lto = true`、`opt-level = "s"`、`strip = true`。panic 策略维持 unwind，保留现有错误隔离行为。`build.removeUnusedCommands = true` 根据静态能力文件裁剪未启用的插件 IPC 命令；本项目自定义校园命令继续保留，Rust 侧调用的文件对话框、通知与打开文件功能继续编译。

本地验证码模型、推理 WASM、PDF 字体和渲染资源、Office 预览器均随安装包保留。体积比较使用相同平台、架构和安装格式的 0.12.3 与 0.13.0 正式 Release 资源。

系统托盘使用官方 Rust Tray API，macOS 使用模板图标，Windows 左键显示窗口、右键显示菜单；macOS 与 Linux 点击托盘菜单操作。主窗口关闭后默认隐藏，后台任务继续运行，“设置 → 外观”可关闭该行为。托盘菜单提供退出，单实例插件负责再次启动时唤回已有窗口。托盘创建失败时保留正常窗口关闭行为。
