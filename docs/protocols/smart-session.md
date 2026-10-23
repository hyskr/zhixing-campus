# 智慧课程会话与接口设计

## 会话建立

智慧课程使用独立的业务会话。MIS 登录成功后，首次进入课程系统仍需要完成一次 OAuth 授权。

```text
MIS /module/module/28/
  → 课程 OAuth /oauth/api/user/thirdLogin
  → SSO /o/authorize/
  → 课程 OAuth /oauth/token/callBack
  → VE /ve/s.shtml?loginType=2
  → getUserInfo 校验当前账号
  → getArticleList 获取业务 sessionId
  → queryCurrentXq 获取学期
  → getCourseList 获取课程
```

`/o/authorize/` 可以直接复用已登录的 SSO Cookie，不能仅因访问这个地址就判定登录过期。实际进入 `/sso/login`、旧 CAS 登录页或返回密码表单时，才交由登录续期流程处理。课程列表、作业、资料和回放使用 VE Cookie 与业务 `sessionId`；SSO Cookie 不直接代替课程业务会话。

已保存的极速登录值可通过 `/ve/s.shtml?loginType=2&login=main_2&username=…` 恢复会话，恢复后校验账号。MIS 主入口不可用时保留本科教学平台备用入口。

## GitHub 实现对照

| 项目与文件 | 设计 | 本项目处理 |
| --- | --- | --- |
| [课程助手 login-service.js](https://github.com/s1y4x1/BJTU-course-assistant/blob/c1e19cdcbe4c6579c099bbe9ffebadf1f6104533/modules/ve/login-service.js)、[login-utils.js](https://github.com/s1y4x1/BJTU-course-assistant/blob/c1e19cdcbe4c6579c099bbe9ffebadf1f6104533/modules/ve/login-utils.js) | 极速登录使用保存的加密 username；登录成功后读取用户信息；另支持课程平台密码登录 | 继续使用当前账号经授权获得的极速登录值，并校验返回账号 |
| [KMP SmartPlatformHandshake.kt](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/64c24ab031547338dca2584faa9f4249ab07c42f/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/homework/SmartPlatformHandshake.kt) | 主入口 module 28，备用入口 module 104；本科平台桥接；qx_kl.jsp 固定跳转到 index | 保留双入口及落地页处理；授权地址识别依据当前学校链路 |
| [bjtu-cli SmartCurriculumService.swift](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/SmartCurriculumService.swift) | getArticleList 返回 sessionId，随后查询学期和课程，业务请求携带 sessionid 头 | 本项目采用相同业务初始化顺序 |
| [BjtuCoursePlatform login.ts](https://github.com/57Darling02/BjtuCoursePlatform/blob/a426761cbb8d38e218ba59653bfaf5f49c3fc47e/src/api/api_ve/login.ts) | 登录后请求 toCoursePlatformIndex，从页面提取 sessionId，写入请求头 | 当前 getArticleList 初始化已通过实测，继续使用 JSON 返回的 sessionId |
| [bjtu_mis_Android VeProvider.kt](https://github.com/wan300/bjtu_mis_Android/blob/55ee861175a284925326b3e3f70aa672bb03d062/android/app/src/main/java/cn/edu/bjtu/mis/data/provider/VeProvider.kt) | 分离课程页面上下文与 AJAX 会话，使用 getArticleList 预热 AJAX sessionId | 保持业务 sessionId 与登录 Cookie 分离 |

## 0.10.3

`src-tauri/src/quick_login.rs` 区分 SSO 授权入口与实际登录页面，跟随 OAuth 回调后再验证课程账号。改动范围仅为智慧课程授权链，其他业务仍使用各自的会话检测。

只巡检智慧课程：

```bash
mise run test:live -- --module learning --report output/live-api/learning.json
```

可追加 `--account 学号` 指定已保存账号。日志输出授权响应状态、主机、路径及账号匹配结果，不输出查询参数、票据或密码。报告保留接口检查结果。

## 验证结果

2026-10-22 使用本机保存账号完成 SSO 登录与智慧课程只读巡检：

- 首次 OAuth 授权账号：取得 13 门课程，134 项通过、0 失败、18 跳过；包含五类资源、作业详情、附件读取、回放列表及媒体读取。
- 已保存极速登录值的账号：取得 9 门课程，课程会话和后续课程接口读取成功。
- 跳过项为未发布教学日历、空个人空间和写操作。教务课表、教室与设备接口不属于本次课程专项巡检。
- 47 项 Rust 单元测试通过，6 项外部环境测试默认忽略。授权测试覆盖 SSO authorize 放行、OAuth 回调、实际登录地址与密码表单识别。

专项报告：`output/live-api/learning-oauth.json`。报告内容为脱敏检查结果，不纳入版本控制。
