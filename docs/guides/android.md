# Android

知行 Campus Android 使用同一套 React 界面与 Rust 校园接口，运行于 Tauri Android。支持 Android 10 及以上、arm64 手机和平板。

## 使用

下载安装 Release 中的 `android-arm64.apk`，允许当前浏览器或文件管理器安装应用。首次启动添加校园账号，使用学校 SSO 登录。凭据默认由 Android Keystore 加密保存，也可选择文件保存或仅本次使用。

底部导航为首页、课表、作业、邮箱和更多。更多包含课程资料、成绩、教室、下载、文件空间、校园服务、账号和设置。

- 手机课表一屏展示全周与全部时段，同一时段课程分行显示；点击格子查看完整教师和地点。
- 邮件列表与正文分别展示，阅读页可返回列表。
- 资料树支持勾选批量操作，文件操作在底部抽屉中展示。
- 下载先保存在应用私有目录；完成后可打开，或导出到系统 `Download/知行Campus/`。批量下载导出保留课程目录结构。
- 校园网站在应用内独立网页窗口打开，导航前刷新校园会话并安装对应 Cookie。
- PDF、DOCX、PPTX 和课程回放沿用本地预览与播放器。

## 构建

真机开发时，电脑和手机连接同一网络；Tauri 通过 `TAURI_DEV_HOST` 设置开发服务器监听地址。模拟器可直接选择已启动设备。

安装 Java 17、Android SDK Platform 36、Build Tools 36.0.0、NDK 27.1.12297006。设置 `JAVA_HOME`、`ANDROID_HOME` 和 `NDK_HOME`。原生 Android 工程已保存在 `src-tauri/gen/android/`，无需重新初始化。

```bash
mise install
mise run setup
rustup target add aarch64-linux-android
mise run android:dev
mise run android:build
```

Release APK 输出到 `src-tauri/gen/android/app/build/outputs/apk/universal/release/`。未配置签名时本地 Release 为未签名包；调试可执行：

```bash
bun run tauri android build --debug --target aarch64 --apk --ci
```

本机正式签名配置放在被 Git 忽略的 `src-tauri/gen/android/app/key.properties`：

```properties
storeFile=/absolute/path/to/zhixing-campus.jks
storePassword=your-store-password
keyAlias=zhixing-campus
keyPassword=your-key-password
```

保留同一份签名密钥才能覆盖安装后续版本。密钥与密码不放入源码仓库。

原生凭据测试（需要已启动的 Android 模拟器，先构建调试 APK）：

```bash
cd src-tauri/gen/android
./gradlew :app:connectedArm64DebugAndroidTest -x :app:rustBuildArm64Debug
```

## 自动打包

`.github/workflows/android-build.yml` 支持手动运行和 `android-v*` tag。仓库 Secrets：

| Secret | 内容 |
| --- | --- |
| ANDROID_KEYSTORE_BASE64 | JKS 文件的 base64 内容 |
| ANDROID_KEYSTORE_PASSWORD | 密钥库密码 |
| ANDROID_KEY_ALIAS | 签名别名 |
| ANDROID_KEY_PASSWORD | 私钥密码 |

工作流生成已签名 arm64 APK，检查签名与 16 KB ZIP 对齐，上传 Artifact；Android tag 发布为独立预览版，桌面稳定版更新清单继续使用原通道。

## 平台差异

- Android 使用 APK 覆盖安装更新；设置中的发布页面可获取新版，不使用桌面 Tauri Updater。
- 提醒与校园网重连依赖应用进程运行。系统休眠、后台冻结或强制停止后，不保证定时检查；当前未接入 Android 前台服务或服务端推送。
- 文件选择使用系统选择器；桌面拖拽与托盘操作由触屏导航、系统文件操作替代。
- 不含 iOS 工程。

## 原生实现

`src-tauri/src/mobile.rs` 衔接 Android 凭据、网页和文件操作；`src-tauri/gen/android/app/src/main/java/cn/zhixing/bjtu/` 保存原生实现；`src/mobile.css` 和 `MobileNavigation.tsx` 定义手机布局。

官方依据：[Tauri Android 环境](https://v2.tauri.app/start/prerequisites/#android)、[移动插件](https://v2.tauri.app/develop/plugins/develop-mobile/)、[Android Keystore](https://developer.android.com/privacy-and-security/keystore)、[16 KB 页面支持](https://developer.android.com/guide/practices/page-sizes)。NDK 27 构建显式使用 16 KB 链接对齐。

PDF 使用 PDF.js legacy 构建并为主线程与 Worker 补齐 `Promise.withResolvers`；旧版 Android WebView 也可打开 PDF。建议保持 Android System WebView 更新。

手机页面的信息结构与样式说明见 [Android 界面设计](../design/android-ui.md)。
