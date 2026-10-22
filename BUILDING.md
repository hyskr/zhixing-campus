# 桌面打包与 GitHub Actions

## 自动构建

`.github/workflows/desktop-build.yml` 在推送 `main`、向 `main` 提交 PR 或手动运行时构建安装包。

| 平台 | 架构 | 安装包 |
| --- | --- | --- |
| Windows | x64 | NSIS `.exe`、WiX `.msi` |
| macOS | Apple Silicon arm64 | `.dmg` |
| macOS | Intel x64 | `.dmg` |
| Linux | x64 | `.deb`、`.AppImage` |

每个平台先运行 TypeScript、前端测试和 Rust 单元测试，再进行 Release 构建。真实学校接口巡检属于手动忽略测试，不在云端运行。

工具版本取自 `mise.toml`；前端依赖使用 `bun.lock`，Rust 使用 `Cargo.lock`。Linux 构建安装 WebKitGTK 4.1、GTK 相关开发包和 DBus；凭据保存使用 Secret Service，桌面环境需要可用的 GNOME Keyring 或其他兼容服务。

## 下载产物

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
