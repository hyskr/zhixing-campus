# 2026-10-22 校园模块连接维护

对照 10 月 20–22 日的上游修正，补齐已有桌面功能的连接流程。

## 智慧课程备用入口

主路径保持 MIS 模块 28。当主入口网络失败或未能建立当前账号的课程会话时，进入 MIS 模块 104，经本科教学平台 `login_introduce_t.html` 和 `NoMasterJumpPage.aspx?URL=jwcZhjx&FPC=page:jwcZhjx` 连接智慧课程。识别 `qx_kl.jsp` 后以固定 index 地址继续，不执行页面脚本。本科平台的 oauth2.ashx 跳转使用 HTTPS。

MIS／SSO 登录过期直接返回认证失效，交由既有统一续期处理。最终通过课程平台返回的 loginName 核对账号。相同的极速登录凭据不重复写入。课程握手按账号顺序执行。

实现：`src-tauri/src/quick_login.rs`、`prepare_smart`。
参考：[KMP SmartPlatformHandshake.kt](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/4046df747c51436aeb3432ef21f7e449736d660d/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/homework/SmartPlatformHandshake.kt)、[课程助手极速凭据去重](https://github.com/s1y4x1/BJTU-course-assistant/commit/3fc96e06e7e39f714a0e2c661d8adb960f44a8fd)。

## 教务认证与数据请求

每个账号的教务认证持独占锁，普通教务数据请求持共享锁，认证期间等待，结束后继续。认证先检查 AA 首页，已有效时直接复用，不重复走 MIS 授权。

教务不可达不影响已完成的 MIS 登录；全量同步记录教务错误，保留成绩和课表缓存，其他数据源继续处理。

实现：`Session.academic_gate`、`get`、`ensure_aa`；缓存行为沿用 `sync_account` 和 `applySync`。
参考：[课程助手认证调度 aa994da](https://github.com/s1y4x1/BJTU-course-assistant/commit/aa994da1f611fef29a5b51e989c527fe9f5592e5)、[KMP 教务不可达修正](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/commit/94d23d8351196a2bd7cbaffe4d53956522e67b3a)。

## 邮箱会话恢复

FA_SECURITY、FA_INVALID_SESSION、S_INVALID_SESSION、S_SESSION_TIMEOUT 统一识别为会话失效。收件箱、已发送列表和完整正文读取可刷新邮箱会话并重试一次；仍失败时交给既有错误处理。发信、上传及写信初始化不在底层自动重试。

邮箱会话初始化与更新按账号串行。多个旧 sid 请求同时失败时，后续恢复直接复用先前请求已更新的 sid，避免反复 SSO 导致写信编号失效。SSO 未登录跳转不会被当作有效邮箱会话。

实现：`src-tauri/src/mailbox.rs`、`campus::mail_session`、`campus::renew_mail_session`。
参考：[课程助手 modules/mail/system.js](https://github.com/s1y4x1/BJTU-course-assistant/blob/c1e19cdcbe4c6579c099bbe9ffebadf1f6104533/modules/mail/system.js)。

## SSO 用户中心入口

快捷入口改为 `https://uc.bjtu.edu.cn/api/login?target=https%3A%2F%2Fuc.bjtu.edu.cn%2Fuser%2Flogin`，先兑换 SSO 票据，再显示用户中心。姓名继续由 MIS 资料页读取。

实现：`campus::shortcut("sso")`。
参考：[课程助手票据回调修正 81b9fb0](https://github.com/s1y4x1/BJTU-course-assistant/commit/81b9fb0f660236337c6dacc6c0de2b3df221ac28)。

## 验证

- 本地 HTTP 服务验证表单跳转、302 跳转和查询参数替换。
- 备用路线验证本科平台桥接、HTTPS OAuth 地址、qx_kl 到 index，以及登录过期退出流程。
- 本地代理验证普通 AA 请求在认证持锁时尚未发出，释放后正常继续。
- 并发邮箱恢复验证共享新 sid，错误分类验证仅允许列表与正文读取重试。
- 缓存测试验证教务不可达时保留成绩与课表，邮箱数据仍可更新。
- 49 项前端、46 项 Rust 测试通过；5 项外部环境测试默认忽略。
- 真实学校备用授权路径、邮箱过期后恢复和用户中心票据兑换待有效账号实测。
