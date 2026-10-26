# 原生交互与更新通道

## Android 正式更新

Android 使用 `android-v<版本>` 正式 tag，安装包沿用 `cn.zhixing.bjtu` 包名与现有签名。CI 从 APK 读取原生 versionCode 和 versionName，生成 Android 更新清单；清单固定地址为：

`https://raw.githubusercontent.com/hyskr/zhixing-campus/update-channel/android.json`

设置 → 应用更新可查看说明、下载或取消下载，并调起系统安装界面。首次安装需用户允许此来源；拒绝授权时保留已下载的 APK。下载到应用缓存目录，完成后复用缓存；安装器启动不代表升级成功，下次启动读取原生版本确认升级。

Android 发布使用 `--prerelease=false --latest=false`。桌面正式 Release 才更新 GitHub 的 latest 指针，避免桌面更新清单被 Android Release 覆盖。

## 界面热更新

接入 `tauri-plugin-hot-update` Rust 0.1.1 与 JS API 0.1.0。插件在 WebView 创建前接管前端资源；界面挂载后确认启动成功，不等待登录或学校网络请求。签名验证、启动失败回退和内置资源兜底由插件提供。

界面清单地址：

`https://raw.githubusercontent.com/hyskr/zhixing-campus/update-channel/frontend/manifest.json`

设置 → 应用更新 → 界面更新显示当前资源版本、可用更新及下载状态。下载后下次退出并重新打开应用时生效；原生版本不足时提示先更新安装包。账号和页面数据继续使用原有 WebView 存储。

推送 `frontend-v<界面版本>` tag，或手动运行 Frontend update 工作流，生成签名归档并更新清单。界面版本与最低原生版本分别记录；最低原生版本取构建源码的 package.json。签名复用已有 Tauri 发布密钥；密钥不进入仓库。清单和签名通过同一 Git 提交更新，避免发布期间读取到不配套文件。

Rust、Kotlin、权限、CLI 或原生依赖变化，通过完整安装包发布。

## 交互

- Android：底部导航切换、课表手势切周和下拉刷新接入官方 Haptics；触觉不可用不阻塞操作。
- 桌面：官方 Window State 保存大小、位置和最大化状态；不恢复托盘隐藏状态。

## 社区下载插件评估

核对版本：[b401475d67](https://github.com/silvermine/tauri-plugin-download/tree/b401475d6781316578d3bc1b2f747fbc586ba2aa)。来源：[silvermine/tauri-plugin-download](https://github.com/silvermine/tauri-plugin-download)。

插件支持 Android WorkManager 前台服务、进度通知和 HTTP Range 续传，适合长时间后台下载。

现有工程 Gradle 9.6.1、AGP 9.3.1 已满足其文档要求；当前 compileSdk 36，插件主分支要求 compileSdk 37。公开接口主要提供 URL、路径、暂停与恢复，全局支持 User-Agent，尚未提供每次下载携带任意请求头或校园 Cookie 的接口。知行课件、邮件附件和回放下载使用账号隔离的会话、Referer 与动态链接，不能直接交给该插件替换。

本轮不替换业务下载；APK 更新使用原生 Rust 下载与应用内进度，可取消，完成后缓存。若后续采用社区插件，先适配学校请求鉴权和临时链接续期，再切换任务执行层。

## 来源

- [Haptics 官方文档](https://v2.tauri.app/plugin/haptics/)
- [Window State 官方文档](https://v2.tauri.app/plugin/window-state/)
- [Android Installer](https://github.com/iMalFect/tauri-plugin-android-installer)
- [Hot Update](https://github.com/yanqianglu/tauri-plugin-hot-update)
