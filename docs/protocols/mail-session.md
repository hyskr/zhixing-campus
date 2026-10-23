# 邮箱会话、HTTP 500 与接口对照

## 保存会话恢复

应用重启后可携带上次保存的 `Coremail.sid`。当前学校 Coremail 在该 sid 失效时，`getAllFolders` 会话检查可能返回 **HTTP 500**，而非 `FA_SECURITY` 等 JSON 错误。

邮箱会话检查遇到 HTTP 500 时，重新请求 MIS 的 `/osys_sso_email/` 换取有效 sid，再继续读取邮件。其他 HTTP 错误保留原始错误状态。发信与附件上传没有自动重放。

`src-tauri/src/campus.rs` 管理邮箱会话；`src-tauri/src/mailbox.rs` 使用会话读取正文、列表和附件。

## 参考项目与维护记录

| 来源 | 实现及适用范围 |
| --- | --- |
| [课程助手 516a76d](https://github.com/s1y4x1/BJTU-course-assistant/commit/516a76d12fc42d0023eee1fd3a2a770685437a78) | 固定 `mbox-data/content.htm` 预览地址，正文接口 HTTP 500 时回退 `readMessage.jsp`。知行正文已直接使用后者；本次保存 sid 的目录检查 500 由实际接口巡检定位。 |
| [课程助手 modules/mail/system.js](https://github.com/s1y4x1/BJTU-course-assistant/blob/c1e19cdcbe4c6579c099bbe9ffebadf1f6104533/modules/mail/system.js) | MIS 邮箱 SSO 换取 sid、`mbox:listThreads`、失效后重新登录。 |
| [KMP MailboxRemoteDataSource.kt](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/64c24ab031547338dca2584faa9f4249ab07c42f/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/mailbox/MailboxRemoteDataSource.kt) | 邮件列表 `mbox:listMessages`、正文 `readMessage.jsp`、附件 `mbox-data`，显式区分读取与发信。 |
| [Android CoremailProvider.kt](https://github.com/wan300/bjtu_mis_Android/blob/55ee861175a284925326b3e3f70aa672bb03d062/android/app/src/main/java/cn/edu/bjtu/mis/data/provider/CoremailProvider.kt) | 目录与消息请求参数、正文和附件字段。 |

检索了上述项目的公开 Issues 和相关搜索结果，未找到与本次保存 sid 的目录检查 HTTP 500 完全对应的 Issue；相关上游依据是维护提交与接口源码。

## 验证

2026-10-22 使用本机保存账号及保存 Cookie 执行只读专项巡检：

```bash
mise run test:live -- --module mail --reuse-session --report output/live-api/mail.json
```

实际链路为：旧 sid 目录检查 HTTP 500 → MIS 邮箱 SSO HTTP 200 → 新 sid 目录检查 HTTP 200。8 项检查通过、0 失败；40 条收件箱记录、1 条已发送记录、完整正文与附件首块读取均成功。4 类写操作按脚本约定跳过。

报告：`output/live-api/mail-recovered.json`。报告不输出账号密码、sid、邮件正文或收件地址。
