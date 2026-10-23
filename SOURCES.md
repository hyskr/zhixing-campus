# 功能实现与参考来源

本文件记录已实现功能的参考关系。代码旁的“参考来源”注释指向上游具体文件；链接固定到本次核对的提交，便于后续查看相同版本。

“参考”包括学校接口、字段、解析规则及交互组织方式；不表示整段代码复制或功能完全相同。直接使用的模型及第三方运行库单独列出。

## 功能与文件对应

| 已实现功能 | 本项目位置 | 上游文件 | 参考范围与本地实现 |
|---|---|---|---|
| CAS/MIS 登录与教务衔接 | [src-tauri/src/lib.rs](src-tauri/src/lib.rs) · `async fn challenge` | [JasonZhang1225/BJTUselfService-KMP-Refreshed · `multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/auth/SchoolLoginProtocol.kt`](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/auth/SchoolLoginProtocol.kt)<br>[fish2lab/bjtu-cli · `Sources/bjtu/Services/MISService.swift`](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/MISService.swift) | 参考 CAS 挑战获取、MIS 登录和教务模块跳转流程；HTTP 与会话管理以 Rust 实现。 |
| 登录表单及个人信息解析 | [src-tauri/src/parsers.rs](src-tauri/src/parsers.rs) · `pub fn login_form` | [JasonZhang1225/BJTUselfService-KMP-Refreshed · `multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/auth/LoginHtmlParser.kt`](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/auth/LoginHtmlParser.kt) | 参考隐藏字段和个人信息的 HTML 选择器。 |
| 成绩解析 | [src-tauri/src/parsers.rs](src-tauri/src/parsers.rs) · `pub fn grades` | [JasonZhang1225/BJTUselfService-KMP-Refreshed · `multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/grade/GradeHtmlParser.kt`](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/grade/GradeHtmlParser.kt)<br>[HFDLYS/BJTUselfService · `app/src/main/java/team/bjtuss/bjtuselfservice/web/MisDataManager.java`](https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/web/MisDataManager.java) | 参考成绩表字段与 data-content 详情解析。 |
| 课表解析 | [src-tauri/src/parsers.rs](src-tauri/src/parsers.rs) · `pub fn schedule` | [JasonZhang1225/BJTUselfService-KMP-Refreshed · `multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/course/CourseScheduleHtmlParser.kt`](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/course/CourseScheduleHtmlParser.kt) | 参考教务课表单元格、教学周及节次解析；输出本项目课程结构。 |
| 课程平台会话与课程列表 | [src-tauri/src/lib.rs](src-tauri/src/lib.rs) · `async fn prepare_smart` | [fish2lab/bjtu-cli · `Sources/bjtu/Services/SmartCurriculumService.swift`](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/SmartCurriculumService.swift)<br>[HFDLYS/BJTUselfService · `app/src/main/java/team/bjtuss/bjtuselfservice/repository/SmartCurriculumPlatformRepository.kt`](https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/repository/SmartCurriculumPlatformRepository.kt) | 参考 MIS 模块 28、sessionid、学期及课程列表的请求顺序。 |
| 课程平台极速恢复登录 | [src-tauri/src/quick_login.rs](src-tauri/src/quick_login.rs) · `pub async fn restore` | [s1y4x1/BJTU-course-assistant · `modules/ve/login-service.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/login-service.js)<br>[s1y4x1/BJTU-course-assistant · `modules/ve/login-utils.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/login-utils.js) | 参考 quickUsername 恢复及失效处理；仅保存当前账号经 MIS 跳转取得的值。 |
| 作业按总数取全 | [src-tauri/src/lib.rs](src-tauri/src/lib.rs) · `async fn fetch_homework_type` | [s1y4x1/BJTU-course-assistant · `modules/ve/homework-core.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/homework-core.js) | 参考 getHomeWorkList 的三类 subType 及按接口总数补齐列表。 |
| 作业详情、提交记录与批语 | [src-tauri/src/learning.rs](src-tauri/src/learning.rs) · `async fn detail_data` | [s1y4x1/BJTU-course-assistant · `modules/ve/homework-core.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/homework-core.js)<br>[JasonZhang1225/BJTUselfService-KMP-Refreshed · `multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/homework/HomeworkSubmissionHtmlParser.kt`](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/homework/HomeworkSubmissionHtmlParser.kt) | 参考作业详情与提交记录接口；正文、附件、分数和批语映射为本项目结构。 |
| 作业提交 | [src-tauri/src/learning.rs](src-tauri/src/learning.rs) · `pub async fn submit_homework` | [s1y4x1/BJTU-course-assistant · `modules/ve/homework-core.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/homework-core.js)<br>[s1y4x1/BJTU-course-assistant · `modules/ve/uploader/upload-common.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/uploader/upload-common.js) | 参考提交接口、正文及 fileList 附件字段。 |
| 文件上传 | [src-tauri/src/learning.rs](src-tauri/src/learning.rs) · `async fn upload_data` | [s1y4x1/BJTU-course-assistant · `modules/ve/uploader/upload-common.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/uploader/upload-common.js)<br>[s1y4x1/BJTU-course-assistant · `modules/ve/uploader/upload-manager.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/uploader/upload-manager.js) | 参考学生上传入口、multipart 字段和上传结果中的 visitName。 |
| 个人资源空间 | [src-tauri/src/learning.rs](src-tauri/src/learning.rs) · `pub async fn resource_space` | [s1y4x1/BJTU-course-assistant · `modules/ve/resource-download.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/resource-download.js) | 参考账号资源查询与资源链接获取流程。 |
| 五类课程资源 | [src-tauri/src/parsers.rs](src-tauri/src/parsers.rs) · `pub fn resource_categories` | [s1y4x1/BJTU-course-assistant · `modules/ve/platform.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/platform.js) | 参考 docType 1、5、10、12、13 的分类映射。 |
| 资源目录读取 | [src-tauri/src/lib.rs](src-tauri/src/lib.rs) · `async fn fetch_children` | [HFDLYS/BJTUselfService · `app/src/main/java/team/bjtuss/bjtuselfservice/repository/SmartCurriculumPlatformRepository.kt`](https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/repository/SmartCurriculumPlatformRepository.kt)<br>[s1y4x1/BJTU-course-assistant · `modules/ve/platform.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/platform.js) | 参考课程资源列表与父目录请求字段；扩展为五类目录。 |
| 回放列表及多视角链接 | [src-tauri/src/media.rs](src-tauri/src/media.rs) · `async fn replay_data` | [s1y4x1/BJTU-course-assistant · `modules/ve/platform.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/platform.js) | 参考回放课程、录制列表及播放链接接口；下载通过本项目原生队列执行。 |
| 未开放资源原始链接 | [src-tauri/src/media.rs](src-tauri/src/media.rs) · `pub fn resource_url` | [s1y4x1/BJTU-course-assistant · `modules/ve/resource-download.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/resource-download.js)<br>[fish2lab/bjtu-cli · `Sources/bjtu/Services/SmartCurriculumService.swift`](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/SmartCurriculumService.swift) | 参考资源真实地址读取；1936 端口及 /kk/rp 路径也见教学日历实现，端口由本项目设置项控制。 |
| 未开放资源 PDF 转换版 | [src-tauri/src/media.rs](src-tauri/src/media.rs) · `pub(crate) async fn stream_open_path`、[src-tauri/src/learning.rs](src-tauri/src/learning.rs) · `resource_links` | 用户提供（见下文“用户提供的功能参考”） | 对 `stu_download=1` 的资源用 `getStreamUrlByRpId` 取 `openPath` PDF 转换版；下载、预览、复制统一走该地址，下载保存为同名 `.pdf`。 |
| 教学日历 PDF | [src-tauri/src/files.rs](src-tauri/src/files.rs) · `pub async fn teaching_calendar` | [fish2lab/bjtu-cli · `Sources/bjtu/Services/SmartCurriculumService.swift`](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/SmartCurriculumService.swift)<br>[HFDLYS/BJTUselfService · `app/src/main/java/team/bjtuss/bjtuselfservice/repository/SmartCurriculumPlatformRepository.kt`](https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/repository/SmartCurriculumPlatformRepository.kt) | 参考课程上下文、iframe#pdfIframe 和静态 PDF 地址解析。 |
| 递归下载与目录保留 | [src-tauri/src/files.rs](src-tauri/src/files.rs) · `pub async fn download_resource_tree` | [HFDLYS/BJTUselfService · `app/src/main/java/team/bjtuss/bjtuselfservice/screen/CoursewareScreen.kt`](https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/screen/CoursewareScreen.kt)<br>[HFDLYS/BJTUselfService · `app/src/main/java/team/bjtuss/bjtuselfservice/utils/DownloadUtil.kt`](https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/utils/DownloadUtil.kt) | 参考课程资源树和批量下载功能；目录遍历与路径保留由本项目实现。 |
| 邮箱会话与收件箱 | [src-tauri/src/campus.rs](src-tauri/src/campus.rs) · `pub async fn mail_session` | [s1y4x1/BJTU-course-assistant · `modules/mail/system.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/mail/system.js) | 参考 MIS 邮箱 SSO、Coremail.sid 及 mbox:listThreads；原生 WebView 登录态由本项目衔接。 |
| 校园网自动重连 | [src-tauri/src/campus.rs](src-tauri/src/campus.rs) · `pub async fn reconnect` | [s1y4x1/BJTU-course-assistant · `modules/campusnet/background.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/campusnet/background.js) | 参考 eportal 登录参数、定时认证与成功通知；使用 Tokio 和系统钥匙串。 |
| 新版 SSO | [src-tauri/src/sso.rs](src-tauri/src/sso.rs) · `parse`、[src/Login.tsx](src/Login.tsx) | [s1y4x1/BJTU-course-assistant · `modules/cas/system.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/cas/system.js) | 参考 loginForm、ssoConfig、flowId 和 SM2 加密登录协议；加密使用 gm-crypto。 |
| 作业状态分组 | [src/homework.ts](src/homework.ts) · `export function homeworkState` | [s1y4x1/BJTU-course-assistant · `app/app.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/app/app.js) | 参考待完成、已提交、已逾期的分组及排序思路，以 React 状态计算实现。 |
| 动态截止倒计时 | [src/homework.ts](src/homework.ts) · `export function timeRemaining` | [s1y4x1/BJTU-course-assistant · `UI/deadline-countdown.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/UI/deadline-countdown.js) | 参考持续更新截止倒计时的交互；采用普通文字和本项目时间格式。 |
| 上传记录与附件复用 | [src/UploadPanel.tsx](src/UploadPanel.tsx) | [s1y4x1/BJTU-course-assistant · `modules/ve/uploader/saved-uploads.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/uploader/saved-uploads.js)<br>[s1y4x1/BJTU-course-assistant · `modules/ve/uploader/index.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/uploader/index.js) | 参考上传记录保存、链接复制及附件复用的功能组织；界面与存储由本项目实现。 |
| 课程内容联动 | [src/CourseDrawer.tsx](src/CourseDrawer.tsx) | [s1y4x1/BJTU-course-assistant · `modules/ve/platform.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/ve/platform.js) | 参考将同一课程的作业、资源、回放放在一起的组织方式；以 React 右侧面板实现。 |
| 按课程展示加载状态 | [src/Assignments.tsx](src/Assignments.tsx) | [s1y4x1/BJTU-course-assistant · `app/app.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/app/app.js) | 参考课程级加载进度及已加载内容先展示的交互；单课重试由本项目实现。 |
| 校园余额与快捷入口 | [src/Services.tsx](src/Services.tsx)、[src-tauri/src/lib.rs](src-tauri/src/lib.rs) · `sync_account` | [HFDLYS/BJTUselfService · `app/src/main/java/team/bjtuss/bjtuselfservice/web/MisDataManager.java`](https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/web/MisDataManager.java)<br>[HFDLYS/BJTUselfService · `app/src/main/java/team/bjtuss/bjtuselfservice/screen/HomeScreen.kt`](https://github.com/HFDLYS/BJTUselfService/blob/7d94f740efa99152456f5a2e72bb0948de4a2e7a/app/src/main/java/team/bjtuss/bjtuselfservice/screen/HomeScreen.kt)<br>[fish2lab/bjtu-cli · `Sources/bjtu/Services/MISService.swift`](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/MISService.swift) | 余额字段参考 MIS 状态接口，充值入口参考原版首页；界面与入口管理由本项目实现。 |
| 验证码模型与字符表 | [src/captcha.ts](src/captcha.ts) | [hyskr/bjtu-captcha-ocr · `dddd_trainer/projects/omis/config.yaml`](https://github.com/hyskr/bjtu-captcha-ocr/blob/ded6c70dd9ac1a6840395770824a28ca9b5a28fd/dddd_trainer/projects/omis/config.yaml)<br>[hyskr/bjtu-captcha-ocr · `dddd_trainer/projects/omis/models/charsets.json`](https://github.com/hyskr/bjtu-captcha-ocr/blob/ded6c70dd9ac1a6840395770824a28ca9b5a28fd/dddd_trainer/projects/omis/models/charsets.json)<br>[hyskr/bjtu-captcha-ocr · `dddd_trainer/utils/load_cache.py`](https://github.com/hyskr/bjtu-captcha-ocr/blob/ded6c70dd9ac1a6840395770824a28ca9b5a28fd/dddd_trainer/utils/load_cache.py) | 模型和字符表直接来自 bjtu-captcha-ocr；输入高度、灰度归一化参考其训练配置，WASM 推理与算式计算由本项目实现。 |
| 新邮件通知基线 | [src-tauri/src/campus.rs](src-tauri/src/campus.rs) · `new_unread` | [BJTU-course-assistant · `modules/mail/system.js`](https://github.com/s1y4x1/BJTU-course-assistant/blob/3a7748fb558667b7d2e27ce4e502e1c350b5a553/modules/mail/system.js) | 参考首次建立基线、仅通知新增未读邮件；持久化及后台任务由本项目实现。 |
| 凭据保存方式 | [src-tauri/src/credentials.rs](src-tauri/src/credentials.rs) | [bjtu-cli · `Sources/bjtu/Core/CredentialStore.swift`](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Core/CredentialStore.swift) | 参考文件、钥匙串、不持久化三种选项；本项目以 Rust keyring 和账号记录实现。 |

## 直接使用的模型与运行库

- `public/models/bjtu-omis.onnx` 来自 [dddd_trainer/projects/omis/models/omis_1.0_104_4500_2024-08-08-09-50-03.onnx](https://github.com/hyskr/bjtu-captcha-ocr/blob/ded6c70dd9ac1a6840395770824a28ca9b5a28fd/dddd_trainer/projects/omis/models/omis_1.0_104_4500_2024-08-08-09-50-03.onnx)，本地仅重命名。
- `public/models/charsets.json` 来自上述模型目录的字符表；`src/captcha.ts` 使用相同顺序。
- PDF 查看使用 PDF.js；DOCX 转换使用 Mammoth；SSO 的 SM2 加密使用 gm-crypto；验证码推理使用 ONNX Runtime Web。运行库及模型归属见 [THIRD_PARTY.md](THIRD_PARTY.md)，随项目保留的许可文本见 `licenses/`。

## 用户提供的功能参考

校园网设备管理参考用户提供的《校园网设备管理器》HTML（附件名 `已粘贴的文本.txt`），没有可引用的公开仓库地址。对应 `src-tauri/src/devices.rs` 与 `src/DeviceManager.tsx`：采用其 `online_list`、`logout` 接口及多选、循环交互；本项目实现当前账号设备校验、原生请求、响应驱动进度和取消。

未开放资源下载默认端口 `1936` 也依据用户提供的实际 PDF 链接，保存在设置中，允许修改。

未开放资源（`stu_download=1`，例如部分 PPT）的原始文件下载会返回 HTTP 500。用户提供学校预览接口 `POST /ve/back/course/courseInfo.shtml?method=getStreamUrlByRpId`（表单 `rpId=…&uLevel=1`），返回 `result.openPath`（PDF 转换版地址）与 `pdfb` 标记。对应 `src-tauri/src/media.rs` 的 `stream_open_path`；本项目据此在下载、预览、复制三个入口统一改用 PDF 转换版，下载时保存为同名 `.pdf`。

## 本项目自行实现的部分

- Tauri/Rust 与 React 桌面集成、页面布局、课程侧栏及全局搜索；BeUI 源码组件的参考和使用关系见 [BEUI.md](BEUI.md)。
- 首页全量同步与各页面按范围同步、独立同步时间、部分失败保留缓存、同账号续期请求合并。
- 凭据保存的 Rust 实现、环境诊断及设置页；三种保存方式的功能设计参考关系见上表。
- 原生下载队列的并行调度、速度和剩余时间、取消、独立下载页与持久历史。功能需求参考课程助手的批量下载体验，未移植其浏览器下载实现。
- 未开放资源的 PDF 转换版处理：`getStreamUrlByRpId` 接口调用与 `openPath` 提取、下载时扩展名改写为 `.pdf`，以及下载/预览/复制的统一路由。
- PDF、图片、文本及 DOCX 的统一预览、全屏控制、已认证文件读取，以及 Rust Cookie 到原生 WebView 的衔接。
- 学校接口请求由本项目适配；学校自身提供的页面和接口行为不归属于参考仓库。

## 核对版本

| 参考仓库 | 提交 |
|---|---|
| [HFDLYS/BJTUselfService](https://github.com/HFDLYS/BJTUselfService) | [`7d94f740efa9`](https://github.com/HFDLYS/BJTUselfService/commit/7d94f740efa99152456f5a2e72bb0948de4a2e7a) |
| [fish2lab/bjtu-cli](https://github.com/fish2lab/bjtu-cli) | [`8a39d48d326a`](https://github.com/fish2lab/bjtu-cli/commit/8a39d48d326ac195360c3564c9576d8a067aad03) |
| [JasonZhang1225/BJTUselfService-KMP-Refreshed](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed) | [`6a72b1c4a18d`](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/commit/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865) |
| [s1y4x1/BJTU-course-assistant](https://github.com/s1y4x1/BJTU-course-assistant) | [`3a7748fb5586`](https://github.com/s1y4x1/BJTU-course-assistant/commit/3a7748fb558667b7d2e27ce4e502e1c350b5a553) |
| [hyskr/bjtu-captcha-ocr](https://github.com/hyskr/bjtu-captcha-ocr) | [`ded6c70dd9ac`](https://github.com/hyskr/bjtu-captcha-ocr/commit/ded6c70dd9ac1a6840395770824a28ca9b5a28fd) |

## BeUI 界面重写

v0.6.0 的侧栏、按钮、标签页、表单控件、弹层、课程抽屉、卡片、成绩表和消息提示使用 BeUI 源码组件。上游为 [starc007/ui-components](https://github.com/starc007/ui-components)，从用户指定的 [MCP](https://mcp.beui.dev/mcp) 读取源码。具体组件、原始文档和本项目使用位置见 [BEUI.md](BEUI.md)；原有学校接口参考关系保留。

## 邮箱界面与富文本

- `src/Mail.tsx` 的三栏信息组织参考 [shadcn-mail 的 mail.tsx](https://github.com/msnabiel/shadcn-mail/blob/ca5faac5ecb0adb9e3b1147b1346a2b033a0a22a/components/ui/mail.tsx)、[mail-list.tsx](https://github.com/msnabiel/shadcn-mail/blob/ca5faac5ecb0adb9e3b1147b1346a2b033a0a22a/components/ui/mail-list.tsx) 与 [mail-display.tsx](https://github.com/msnabiel/shadcn-mail/blob/ca5faac5ecb0adb9e3b1147b1346a2b033a0a22a/components/ui/mail-display.tsx)。学校邮箱读取、账号会话和原邮件打开仍由本项目 `src-tauri/src/campus.rs` 实现；邮箱 UI 使用 BeUI 组件重新编写，没有移植参考项目的邮件数据或发送操作。
- `src/typeset.css` 来自 [shadcn/typeset](https://ui.shadcn.com/typeset.css)。`src/RichContent.tsx` 的作业要求和已交正文使用 `typeset typeset-docs`；`src/FilePreview.tsx` 的 DOCX 预览继续使用独立的 `.rich-content` 样式。
- 字体由 `@fontsource-variable/geist` 与 `@fontsource-variable/geist-mono` 提供，加载点在 `src/main.tsx` 和 `index.html`。

## v0.7 页面组件

课程文件树、设置分类和首页入口分别使用 BeUI 的 `file-tree`、`bouncy-accordion`、`sortable-stack` 源码，组合逻辑位于 `ResourceExplorer.tsx`、`SettingsGroups.tsx`、`HomeShortcuts.tsx`。上传队列、课程切换、批量操作、搜索、通知、提示及全屏工具条的组件来源与使用位置见 [BEUI.md](BEUI.md)，安装文件清单见 [beui.components.json](beui.components.json)。学校登录与数据接口参考关系保持上表记录。

## 下载目录与时间记录

`resourcePaths.ts` 从当前课程资源树生成保存路径，多选下载通过 `DownloadItem.relativePath` 传入原生下载队列；子目录递归下载同样传入完整父路径。`media.rs` 保存加入、开始和结束时间，重试时更新当前下载的时间；`Downloads.tsx` 使用固定高度的卡片展示时间、速度和保存位置。

## 浮动操作反馈与最近更新

`ui.tsx` 使用 BeUI `animated-toast-stack` 统一操作反馈；组件关闭按钮在 `src/components/motion/animated-toast-stack.tsx` 中提供中文名称。`UpdatesPopover.tsx` 通过已有 BeUI Card、Button、Animated Badge 组合更新列表，使用当前账号的 `Change` 数据；来源文件和许可见 [BEUI.md](BEUI.md)。

## 邮箱滚动与入口会话衔接

`Mail.tsx` 与 `styles.css` 为收件列表和摘要阅读区提供独立的有界滚动区域。`service.ts` 的 `openSchoolPage` 复用已有登录恢复流程；`campus.rs` 在打开网页前更新 MIS 和目标平台 Cookie。教务及智慧课程衔接分别沿用 `ensure_aa` 与 `quick_login::enter_from_mis`，上游参考文件见前文登录与平台会话条目。

## AA 网页授权与 Cookie 衔接

AA 网页入口使用 MIS `/module/module/10/`，在 WebView 内完成浏览器侧的 SSO。原生 `ensure_aa` 以 `/notice/item/` 及登录表单检查确认认证结果；完成地址参考上表 `MISService.swift` 与 `SchoolLoginProtocol.kt`。`campus.rs::school_webview_cookies` 只导出有效 Cookie，保留域、路径、HttpOnly、SameSite 与绝对到期时间，不重新使用相对 Max-Age。

## 0.8.0 回放、阅读器与教室占用

| 功能 | 本项目位置 | 参考文件与范围 |
| --- | --- | --- |
| 多视角同步、单路音频、倍速 | `src/ReplayViewer.tsx` | [BjtuCoursePlatform · CourseReplaySyncPlayer.vue](https://github.com/57Darling02/BjtuCoursePlatform/blob/a426761cbb8d38e218ba59653bfaf5f49c3fc47e/src/features/replay/components/CourseReplaySyncPlayer.vue)：参考交互及媒体同步方式，以 React 实现。 |
| PDF 目录与文字搜索 | `src/PdfNavigation.tsx` | [BjtuCoursePlatform · CoursewarePage.vue](https://github.com/57Darling02/BjtuCoursePlatform/blob/a426761cbb8d38e218ba59653bfaf5f49c3fc47e/src/pages/courseware/CoursewarePage.vue)：参考完整 PDF.js 阅读器能力，本项目直接调用已有 PDF.js API。 |
| 教室占用 | `src-tauri/src/classrooms.rs`、`src/Classrooms.tsx` | [KMP · ClassroomOccupancyHtmlParser.kt](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/classroomoccupancy/ClassroomOccupancyHtmlParser.kt)：参考 7×7 单元格与颜色分类；当前接口和楼宇选项由学校页面核对。 |

四个选课项目的文件、版本与流程对照见 [COURSE-RESEARCH.md](COURSE-RESEARCH.md)。选课执行尚未接入。

## 0.9.0 完整邮箱

| 功能 | 本项目位置 | 参考来源 |
| --- | --- | --- |
| 正文、写信、回复与发送 | `src-tauri/src/mailbox.rs`、`src/mailbox.ts`、`src/MailCompose.tsx` | [KMP MailboxRemoteDataSource.kt](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/mailbox/MailboxRemoteDataSource.kt)：Coremail 表单与 JSON 字段。 |
| 已读更新、分块上传与附件参数 | `src-tauri/src/mailbox.rs` | [Android CoremailProvider.kt](https://github.com/wan300/bjtu_mis_Android/blob/55ee861175a284925326b3e3f70aa672bb03d062/android/app/src/main/java/cn/edu/bjtu/mis/data/provider/CoremailProvider.kt)：`mbox:updateMessageInfos`、`upload:prepare`、2 MiB 分块上传和附件绑定字段。 |

邮件正文使用独立沙箱阅读区域，附件衔接本项目已有预览与下载队列。有效邮箱会话先核对并复用，避免重新 SSO 更换 sid 导致写信编号失效。发送接口不自动重试；本地标记只在服务器读取或更新成功后修改。

## 0.9.1 已发送

`src-tauri/src/mailbox.rs` 的 `mail_sent` 使用 Coremail `mbox:listMessages` 与已发送 FID 3，参考 [KMP MailboxRemoteDataSource.kt](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/mailbox/MailboxRemoteDataSource.kt) 和 [MailboxScreenModel.kt](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/feature/mailbox/MailboxScreenModel.kt) 的文件夹编号。列表保留实际发件人、收件人、发送时间，分页与账号缓存由本项目实现。已发送详情复用现有正文和附件读取。

## 0.10.0 可切换外观与首页

Claude App 风格参考 [Anthropic 的桌面应用界面资料](https://academy.claude.com/tutorials/navigating-the-claude-desktop-app) 的视觉方向，使用本项目 CSS 令牌和系统字体实现，未引入 Claude 的组件代码、图标或字体文件。实现位于 `src/appearance.css`、`src/AppearanceSettings.tsx` 与 `src/preferences.tsx`。

首页的四块信息区、邮箱优先级与邮件动态合并由本项目实现，位置为 `src/HomeDashboard.tsx`、`src/storage.ts`、`src/App.tsx`。`src/courseWeeks.ts` 保留原有教学周判断，用于首页与课表共享。

## 0.10.1 SSO 主登录更新

最近两天上游提交、具体文件和本项目对应实现见 [AUTH-20261020.md](AUTH-20261020.md)。主流程参考 KMP `cc23379` 的 MIS OAuth 认证和验证码错误分类；课程助手 `99a6a37` 用于核对默认 SSO 及共享浏览器的账号切换行为。SM2 使用既有 gm-crypto，以 KMP 公开的学校 sm-crypto 夹具交叉验证。

## 0.10.2 模块连接维护

智慧课程备用路径、教务认证协调、邮箱 FA_SECURITY 恢复、极速凭据去重和用户中心票据回调的具体上游文件、固定提交及本项目实现位置，见 [MAINTENANCE-20261022.md](MAINTENANCE-20261022.md)。

## 真实接口巡检脚本

`src-tauri/src/live_api.rs` 直接复用本项目已有 SSO、MIS、教务、作业、资料、回放和邮箱请求与解析；脚本未另行移植学校接口。`scripts/encrypt-sso.ts` 通过标准输入衔接同一 `src/ssoCrypto.ts` 实现。模块的上游参考关系沿用各实现文件的固定版本注释。

## 0.10.3 智慧课程会话

课程授权、业务 sessionId 与各上游文件的对照见 [SMART-SESSION.md](SMART-SESSION.md)。`quick_login.rs` 的 OAuth 授权入口识别依据学校当前授权链实测；`live_api.rs` 与 `scripts/test-live-api.ts` 支持单独巡检智慧课程。

## 0.11 邮箱、通知与文件预览

- 邮箱会话维护与上游源码／提交对照：[MAIL-SESSION.md](MAIL-SESSION.md)。
- 成绩与课程提醒调度：[NOTIFICATIONS.md](NOTIFICATIONS.md)。系统投递使用已有 Tauri 通知插件，调度、缓存和去重在本项目实现。
- 界面与导航调整：[UI-REVIEW.md](UI-REVIEW.md)，设置复用 BeUI Button／Switch／Select，保留现有 Sidebar、Tooltip。
- DOCX、PPTX 本机预览及依赖来源：[OFFICE-PREVIEW.md](OFFICE-PREVIEW.md)。

## 0.11.1 上游维护

两个仓库的版本范围、对应文件、适用性与本次吸收项见 [UPSTREAM-20261022.md](UPSTREAM-20261022.md)。邮件实体正文参考 HFDLYS `HtmlEmailRenderer.kt`；当前节次参考同版本 `CourseScheduleScreen.kt`。首页布局按本项目需求调整，继续使用 BeUI。

## 应用内更新

`src/AppUpdater.tsx`、`src/updater.ts` 使用 [Tauri 官方 Updater 插件](https://v2.tauri.app/plugin/updater/) 的检查、下载签名验证、安装流程及 Process 插件重启。Release 的资源归档与清单生成在 `scripts/stage-release.ts`、`scripts/update-manifest.ts` 实现，通过公开 GitHub Releases 分发。
