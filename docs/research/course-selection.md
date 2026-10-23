# 回放、预览与选课实现对照

核对时间：2026-10-19。研究范围限北京交通大学系统。本文中的选课实现为源码分析，未对真实课程执行选课、退课或替换。

## 回放与预览

[57Darling02/BjtuCoursePlatform · CourseReplaySyncPlayer.vue](https://github.com/57Darling02/BjtuCoursePlatform/blob/a426761cbb8d38e218ba59653bfaf5f49c3fc47e/src/features/replay/components/CourseReplaySyncPlayer.vue) 将多路视频同步，选择一路提供声音和播放控制，支持倍速，并按浏览器能力使用原生 HLS 或 hls.js。

[CoursewarePage.vue](https://github.com/57Darling02/BjtuCoursePlatform/blob/a426761cbb8d38e218ba59653bfaf5f49c3fc47e/src/pages/courseware/CoursewarePage.vue) 实际嵌入完整 PDF.js viewer。仓库中的 `PdfPreview.vue` 是另一个包含示例地址的组件，不能代表实际课件页的全部功能。学校转换预览地址可从预览页取出 `/kk/` 文件路径；知行已有对应的认证请求和可配置 1936 端口路由。

知行 0.8.0 新增：

- 多视角同步播放、暂停、定位，定时修正画面偏移；所选视角提供声音。
- 0.75×、1×、1.25×、1.5×、2×；单视角切换保留位置。
- HLS 原生支持优先，否则按需加载 hls.js。
- PDF 目录跳转、全文文字搜索、命中页与摘要。原有翻页、缩放、全屏和下载继续使用。

实现位置：`src/ReplayViewer.tsx`、`src/PdfNavigation.tsx`、`src/FilePreview.tsx`。

## 大家如何实现抢课

| 项目与具体文件 | 登录和提交方式 | 可吸收的设计与适用范围 |
| --- | --- | --- |
| [hyskr/BJTU-course-autoget-program · src/login.py](https://github.com/hyskr/BJTU-course-autoget-program/blob/8a3bdf3eb2136ea57709a8cd4f280488234e8f3a/src/login.py) | Python Session 衔接 MIS、AA；向 `selects_action/?action=submit` 提交 `checkboxs`、`hashkey`、`answer`。MIS 算术验证码使用本地模型，AA 选课验证码使用图鉴接口。 | Electron + Python WebSocket 分离界面与执行器；提交后读取选课页面和消息。其 0.1 秒延迟出现在提交后的流程中，不代表完整的监控周期。不能把现有 MIS OCR 直接当作 AA 选课识别器。 |
| [xschur/CourseRobber · README](https://github.com/xschur/CourseRobber/blob/5d05769bace99155a4ead62c8f29f3a936227461/README.md)、[checkbox.py](https://github.com/xschur/CourseRobber/blob/5d05769bace99155a4ead62c8f29f3a936227461/checkbox.py) | 面向旧 `dean.bjtu.edu.cn`；先准备验证码和选课参数，监控到可选余量后提交。 | 提前准备挑战、把查询和提交分开有参考价值。公开代码没有完整提供 README 描述的后续算法，`CourseRobber.py` 主要为初始化，旧域名和硬编码会话不能直接迁入。 |
| [fish2lab/bjtu-cli · CourseGrabbingService.swift](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/CourseGrabbingService.swift) | 恢复 AA；查询 school/cross/others 分类，解析 checkbox 标识；刷新验证码，提交同一组表单字段；解析 Cookie 消息及返回页面。 | 查询、验证码、提交和退课接口拆分清楚，适合参考 Rust 接口组织。其提交消息解析仍需结合已选列表确认最终结果。 |
| [wan300/bjtu_mis_Android · AaProvider.kt](https://github.com/wan300/bjtu_mis_Android/blob/55ee861175a284925326b3e3f70aa672bb03d062/android/app/src/main/java/cn/edu/bjtu/mis/data/provider/AaProvider.kt)、[CourseSelectionRunner.kt](https://github.com/wan300/bjtu_mis_Android/blob/55ee861175a284925326b3e3f70aa672bb03d062/android/app/src/main/java/cn/edu/bjtu/mis/data/course/CourseSelectionRunner.kt) | 从实际页面解析表单与验证码上下文；提交验证码后重新读取课程列表，区分 `success`、`submitted` 和再次需要验证码。 | 四者中最适合参考完整执行流程：目标去重、有限轮次、可设间隔、人工验证码暂停、停止、批量结果与完成目标。Android 前台服务不能直接用于 Tauri，需要采用桌面执行任务。 |

### 知行选课模块方案

以 Android 项目的任务状态和结果复核为主，以 CLI 的接口拆分为辅。复用知行 AA 登录态，查询时刷新认证，保存课程标识与教学班，避免只靠课程名称匹配。

页面分为课程查询、已选课程、目标队列、执行记录。验证码展示后等待输入；提交后重新读取已选列表，确认成功的目标从队列移出，未确认结果保留状态。轮次与间隔可设，提供停止按钮和结果 Toast。替换课程独立呈现退课与选课结果。

此版本完成源码研究，尚未接入选课执行功能。

## 教室占用

新增侧栏页面“教室占用”，使用当前 AA `/classroom/timeholdresult/room_view/`，参数为教学周 `zc`、楼宇编号 `jxlh` 和可选学期 `zxjxjhh`；楼宇和学期选项来自学校页面。旧 CLI 使用的 `/classroomtimeholdresult/room_view/` 路径不作为当前入口。

页面支持楼宇、教学周、学期查询，按星期、时段、座位数、教室编号和空闲状态筛选，点击教室查看整周 7×7 占用。保留学校的排课、调课、考试、实验、其他占用分类，未知颜色显示“未知”。

解析参考 [KMP ClassroomOccupancyHtmlParser.kt](https://github.com/JasonZhang1225/BJTUselfService-KMP-Refreshed/blob/6a72b1c4a18d5c6ff6d6f62518f995eb8bcdb865/multiplatform/shared/src/commonMain/kotlin/team/bjtuss/bjtuselfservice/shared/data/classroomoccupancy/ClassroomOccupancyHtmlParser.kt)。实现位于 `src-tauri/src/classrooms.rs` 和 `src/Classrooms.tsx`。

## 验证与限制

- 当前 AA 页面只读请求成功，解析得到 35 个楼宇选项、思源楼 37 间教室。
- 浏览器演示数据验证空闲筛选、49 时段详情、1440×900 与 1040×720 布局。
- 本地双视频验证同步播放、暂停、定位、单路音频和 1.5× 倍速。
- 学校已发布回放的实际播放、Windows HLS 和打包仍需对应环境验证。
- PDF 搜索针对文本层，结果为命中页与文字摘要；扫描图片版不执行 OCR，本版本不包含标注编辑。
