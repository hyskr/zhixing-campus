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
git tag -a v0.12.0 -m "知行 Campus 0.12.0"
git push origin v0.12.0
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
