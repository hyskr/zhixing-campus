# 目录与源码导航

## 目录职责

- `src/`：React 界面、应用状态、Tauri 调用与前端测试；`components/motion/` 保存安装的 BeUI 组件。
- `src-tauri/src/`：校园接口、账号会话、持久化与原生桌面能力。
- `public/`：本地识别模型、PDF 字体与渲染资源、预览测试文件。
- `scripts/`：手动真实接口巡检、构建产物归档、更新清单生成及其测试。
- `.github/workflows/`：版本 tag 驱动的跨平台构建和公开 Release。
- `docs/`：按指南、功能、协议、设计、来源、验证、研究和发布版本组织 Markdown。
- `licenses/`：第三方依赖许可文本。
- `output/`、`dist/`、`src-tauri/target/`：本机输出或构建缓存，由 Git 忽略。

## 主要实现入口

| 模块 | 前端 | Rust |
| --- | --- | --- |
| 应用与设置 | `App.tsx`、`main.tsx`、`Settings.tsx`、`preferences.tsx` | `lib.rs`、`settings.rs` |
| 登录与凭据 | `Login.tsx`、`service.ts`、`ssoCrypto.ts` | `sso.rs`、`quick_login.rs`、`credentials.rs` |
| 课表、成绩与教室 | `Pages.tsx`、`Classrooms.tsx` | `lib.rs`、`parsers.rs`、`classrooms.rs` |
| 作业与课程资源 | `Assignments.tsx`、`LearningResources.tsx`、`ResourceExplorer.tsx` | `learning.rs`、`files.rs` |
| 下载与回放 | `Downloads.tsx`、`ReplayViewer.tsx` | `media.rs` |
| 邮箱 | `Mail.tsx`、`MailCompose.tsx`、`mailbox.ts` | `mailbox.rs`、`campus.rs` |
| 文件预览 | `FilePreview.tsx`、`OfficePreview.tsx`、`PdfNavigation.tsx` | `files.rs` |
| 校园服务与提醒 | `Services.tsx`、`NotificationSettings.tsx`、`ReminderBridge.tsx` | `campus.rs`、`devices.rs`、`reminders.rs` |
| 托盘与更新 | `AppUpdater.tsx`、`updater.ts` | `tray.rs`、`updates.rs`、`lib.rs` |

## 配置与发布

`package.json` 与 `bun.lock` 管理前端，`src-tauri/Cargo.toml` 与 `Cargo.lock` 管理 Rust。`mise.toml` 固定工具版本，`tauri.conf.json` 管理窗口、资源、打包与更新端点，`capabilities/default.json` 声明前端可用的原生命令。

版本号在 package、Cargo 与 Tauri 配置中保持一致。发布说明位于 `docs/releases/<版本>.md`，跨平台产物及 `latest.json` 由 GitHub Actions 发布。协议与来源说明见[文档目录](../index.md)。
