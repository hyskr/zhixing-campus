# Android 0.14.0 预览版

支持 Android 10+、arm64。

- 手机首页、底部导航与 BeUI 底部抽屉。
- 按天查看课表，同一时段课程完整显示地点与教师。
- 邮箱列表、完整正文、新建与回复、已发送及已读同步。
- 课程资料树、批量下载、课程回放与 PDF/DOCX/PPTX 预览。
- Android Keystore 凭据存储，支持文件保存和仅本次使用。
- 系统文件选择、下载记录、打开与导出到系统下载目录。
- 刷新登录态后在应用内打开学校网站。

下载安装 APK；后续使用同签名版本覆盖安装。提醒需要应用进程运行，系统冻结后不保证后台检查。真实账号登录和各校内业务仍需在实际手机与校园网络下验证。

验证：63 项前端、51 项 Rust 与 Android Keystore 原生测试通过；Android 14 模拟器验证启动、系统通知、目录导出和三种文档格式的本地渲染。

[下载 Android APK](https://github.com/hyskr/zhixing-campus/releases/download/android-v0.14.0-preview.3/zhixing-campus_0.14.0_android-arm64.apk) · [使用与构建](../guides/android.md)
