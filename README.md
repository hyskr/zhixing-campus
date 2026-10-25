# 知行 Campus

北京交通大学校园工作台，使用 Tauri 2、React、TypeScript 和 BeUI 构建，支持 Windows、macOS、Linux 和 Android。

[桌面安装包](https://github.com/hyskr/zhixing-campus/releases/latest) · [Android APK](https://github.com/hyskr/zhixing-campus/releases/download/android-v0.14.1-preview.2/zhixing-campus_0.14.1_android-arm64.apk) · [Android 使用与构建](docs/guides/android.md) · [文档目录](docs/index.md) · [构建与发布](docs/guides/building.md)

## 功能

- 校园账号 SSO 登录、多账号和凭据保存方式选择。
- 课表、成绩、作业、课程资源、教学日历与多视角回放。
- 课件与附件的单个、递归及批量下载，下载记录与进度。
- 邮箱收件箱、已发送、正文与附件、新建与回复、已读同步。
- 校园网与校园卡服务、教室占用、学校网站快捷入口。
- PDF、DOCX、PPTX 在线预览，邮件、成绩和上课提醒。
- 可切换界面风格、系统托盘与应用内签名更新。

[完整功能说明](docs/guides/features.md) · [功能来源对照](docs/references/sources.md)

## 开发

安装 [Tauri 平台依赖](https://v2.tauri.app/start/prerequisites/) 和 mise 后，在项目根目录执行：

```bash
mise install
mise run setup
mise run dev
```

```bash
mise run check       # TypeScript
mise run test        # 前端及 Rust 单元测试
mise run test:live   # 使用本机保存账号巡检真实只读接口
mise run build      # 当前平台正式安装包
```

真实巡检依赖校园网络和有效账号，不在 CI 中执行。签名构建与无签名开发构建命令见[构建指南](docs/guides/building.md)。

## 项目结构

```text
.github/workflows/      三平台构建与版本发布
src/                   React 界面、状态与业务服务
  components/motion/   BeUI 组件
src-tauri/
  src/                 Rust 校园接口、会话、下载、提醒与托盘
  capabilities/        平台权限
  gen/android/         Android 原生工程与平台桥接
  icons/               应用与托盘图标
public/                OCR 模型、PDF 资源及预览测试文件
scripts/               接口巡检、发布归档与更新清单生成
licenses/              第三方依赖许可
docs/                 使用指南、功能、协议、设计、来源与验证文档
```

源码导航见[项目结构说明](docs/architecture/project-structure.md)。依赖、构建产物、真实账号与会话、测试输出不纳入 Git。

## 发布与更新

版本 tag 触发 GitHub Actions，构建 Windows x64、macOS Apple Silicon／Intel、Linux x64，发布安装包、更新签名与清单。应用内入口为“设置 → 应用更新”；Linux DEB 使用手动安装包更新。

[构建与发布指南](docs/guides/building.md) · [发布说明](docs/releases/0.13.1.md) · [验证记录](docs/testing/validation.md) · [第三方许可](docs/references/third-party.md)

Android 使用 `android-v*` tag 独立构建已签名 arm64 APK，发布为预览版；[Android 指南](docs/guides/android.md)。
