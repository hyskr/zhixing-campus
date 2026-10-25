# BeUI 界面与 Bun 开发

知行 Campus v0.7.4 使用 BeUI 源码组件重写界面，React 页面调用已有校园服务接口。运行与依赖管理使用 Bun。

## 组件来源与使用位置

基础源码于 2026-10-18 从 https://mcp.beui.dev/mcp 通过 `get_component` 读取，按其返回的路径安装组件及辅助文件。上游项目：[starc007/ui-components](https://github.com/starc007/ui-components)，MIT 许可见 [licenses/beui.txt](../../licenses/beui.txt)。原始文件清单保存在 [beui.components.json](../../beui.components.json)。

| BeUI 组件 | 上游文档 | 本项目使用位置 |
|---|---|---|
| Animated Sidebar | [animated-sidebar](https://beui.dev/components/motion/animated-sidebar) | `CampusSidebar.tsx`、`App.tsx`：分组导航、侧栏折叠、移动窗口抽屉 |
| Breadcrumb | [breadcrumb](https://beui.dev/components/motion/breadcrumb) | `App.tsx`：顶部工作空间与当前页面路径 |
| Button | [button](https://beui.dev/components/motion/button) | 各页面操作、同步、上传、下载与关闭按钮 |
| Tabs | [tabs](https://beui.dev/components/motion/tabs) | 课表类型、作业类型、文件／回放、设备服务、邮箱与下载状态 |
| Input | [input](https://beui.dev/components/motion/input) | 搜索、登录、端口与网络设置 |
| Select | [select](https://beui.dev/components/motion/select) | 作业筛选、认证方式、凭据模式、并行数与回放课程选择 |
| Switch | [switch](https://beui.dev/components/motion/switch) | 连接、上传复用、通知和自动重连设置 |
| Checkbox | [checkbox](https://beui.dev/components/motion/checkbox) | 资源、设备、附件多选 |
| Card | [card](https://beui.dev/components/motion/card) | `HomeDashboard.tsx`、`UpdatesPopover.tsx`：首页四个信息区与更新面板 |
| Table | [table](https://beui.dev/components/motion/table) | `Pages.tsx`：可排序成绩表与虚拟滚动 |
| Center Morph Modal | [center-morph-modal](https://beui.dev/components/motion/center-morph-modal) | `ui.tsx`：登录、成绩、作业详情、确认与文件预览 |
| Drawer | [drawer](https://beui.dev/components/motion/drawer) | `ui.tsx`、`CourseDrawer.tsx`：课程详情侧栏 |
| Animated Toast Stack | [animated-toast-stack](https://beui.dev/components/motion/animated-toast-stack) | `ui.tsx`：统一错误、信息、同步与操作反馈 |
| Animated Badge | [animated-badge](https://beui.dev/components/motion/animated-badge) | `Mail.tsx`、`Assignments.tsx`、`Downloads.tsx`：未读、作业与下载状态 |
| Tooltip | [tooltip](https://beui.dev/components/motion/tooltip) | `Mail.tsx`：刷新操作提示 |
| Stateful Button | [button](https://beui.dev/components/motion/button) | `ui.tsx`：同步中的状态反馈 |

本轮新增组件从 [BeUI 公共 Registry](https://beui.dev/r/registry.json) 的对应 `/r/<slug>.json` 读取，完整文件及依赖清单保存在 `beui.components.json`。

| 新增／组合组件 | 安装来源 | 使用位置 |
|---|---|---|
| File Upload | [file-upload](https://beui.dev/r/file-upload.json) | `UploadPanel.tsx`：文件选择、拖拽、上传队列、失败重试；粘贴仍接入原上传流程 |
| Overflow Actions | [overflow-actions](https://beui.dev/r/overflow-actions.json) | `ResourceExplorer.tsx`：批量下载与更多文件操作 |
| Morphing Search | [morphing-search](https://beui.dev/r/morphing-search.json) | `App.tsx`：⌘K / Ctrl+K 搜索页面、课程和作业 |
| Animated Collapsible | [collapsible](https://beui.dev/r/collapsible.json) | `Assignments.tsx`：待完成、已提交、已逾期独立折叠 |
| Sortable List | [sortable-stack](https://beui.dev/r/sortable-stack.json) | 源码已安装，首页改为页首 Select 选择课程空间 |
| Multi Select | [multi-select](https://beui.dev/r/multi-select.json) | `Assignments.tsx`：多门课程组合筛选 |
| Shared Layout Background | [shared-layout-bg](https://beui.dev/r/shared-layout-bg.json) | 侧栏和 File Tree 内部的选中态 |
| File Tree | [file-tree](https://beui.dev/r/file-tree.json) | `ResourceExplorer.tsx`：课程、资源分类、文件夹和文件图标，左目录右详情，文件和文件夹可直接勾选 |
| Dock | [dock](https://beui.dev/r/dock.json) | `FilePreview.tsx`：全屏查看时的退出、下载和关闭入口 |
| Text Animation | [text-reveal](https://beui.dev/r/text-reveal.json) | `App.tsx`：未连接账号的欢迎标题 |
| Action Swap | [action-swap-blur](https://beui.dev/r/action-swap-blur.json) | `ResourceExplorer.tsx`：复制成功切换为“已复制” |
| Bouncy Accordion | [bouncy-accordion](https://beui.dev/r/bouncy-accordion.json) | 源码已安装；设置现使用固定分类导航 |
| Scroll Animation | [scroll-progress](https://beui.dev/r/scroll-progress.json) | `ResourceExplorer.tsx`：资料目录实际可滚动时显示位置 |
| Loader | [loader](https://beui.dev/r/loader.json) | `ResourceExplorer.tsx、LearningResources.tsx、HomeworkDetail.tsx、FilePreview.tsx`：加载状态 |

组件位于 `src/components/motion/`；`src/lib/` 保留 MCP 返回的动画参数、辅助函数及 hooks。通过 `className` 和应用样式调整颜色、密度、宽度与排版，业务回调在各页面中直接使用 BeUI 的事件 API。浏览器原生文件选择、视频播放与文档画布保留各自功能。

## 本项目设计

- Codex 风格的中性浅色工作台、石墨文字与紧凑分组导航。
- 所有页面使用单行标题；首页固定展示邮箱、作业、校园动态和今日课表，页首 Select 提供课程空间入口，超出摘要容量通过完整页面查看。
- 首页和课表在 1040 × 720 及以上桌面窗口适配一屏；课表七个时段等高，同格课程水平并列，完整信息通过 Tooltip 和课程侧栏查看。
- 设置仅在内容超出时内部滚动；页面禁用滚动边界回弹。
- 资料页左侧为课程文件树，右侧展示选中文件的详情与操作；文件类型有独立图标。
- 课表、作业、资源、邮箱、下载与设置使用一致的字体、行高、标题、筛选和详情层级。
- 校园邮箱采用文件夹导航、邮件列表、摘要阅读区三栏布局，结构参考 [shadcn-mail 的 Mail、MailList 与 MailDisplay](https://github.com/msnabiel/shadcn-mail/tree/main/components/ui)。只展示当前接入的学校收件箱功能。
- 页面同步范围、账号缓存、学校登录协议及上传下载流程沿用校园服务实现。

## Bun

```sh
bun install --frozen-lockfile
bun run dev
bun run build
bun run test
bun run tauri dev
bun run tauri build --bundles app
```

`packageManager` 固定为 `bun@1.4.3`，依赖版本由 `bun.lock` 锁定。Tauri 的开发和构建前置命令分别调用 `bun run dev` 和 `bun run build`。

操作结果通过 `useFeedback` 发送，页面错误通过 `useErrorState` 保留业务状态并发出提示；`FeedbackAlerts` 在正文之外使用 BeUI Animated Toast Stack 显示。一般提示 4.5 秒、错误 6.5 秒后消失，可手动关闭，最多保留三条。同样的操作可重复通知，全屏文件查看时提示进入当前全屏容器。File Tree 的 `renderAccessory` 扩展在行尾组合 BeUI Checkbox；勾选文件夹时先刷新并递归读取后代目录，再选择返回的文件；顶部全选同样读取全部课程目录。取消选择不发起请求。课程侧栏使用文字始终可见的 Tabs 导航。

课程关联以 `courseMatching.ts` 处理教务名称的培养层次后缀，例如“工程伦理 [研]”对应“工程伦理”；不删除“在线课程”等课程标题内容。未自动匹配时可在侧栏选择对应智慧课程。

`UpdatesPopover.tsx` 使用 BeUI Card、Button、Animated Badge 组合最近更新：标题允许两行，类别、变更类型与时间位于下一行，最多展示最近六条并提供查看全部入口。Esc 关闭后焦点回到通知按钮。

## 0.8.0 使用位置

- `Classrooms.tsx`：Select 选择楼宇、周次、学期与时段；Input 搜索教室及座位数；Checkbox 筛选空闲；Button 刷新；Loader 显示请求状态。
- `ReplayViewer.tsx`：Checkbox 切换多视角，Select 选择倍速，Button 同步画面。
- `PdfNavigation.tsx`：Button 切换目录和搜索、Input 输入关键词、Loader 显示搜索状态。错误继续使用全局浮动 Toast。

## 0.9.0 邮件阅读与写信

`Mail.tsx` 使用 Checkbox 多选、Button 标记已读与回复、Loader 显示完整正文读取状态。`MailCompose.tsx` 使用 FileUpload 选择／拖入多附件、上传状态与失败重试，Input 编辑地址与主题，Center Morph Modal 承载写信和发送核对。操作结果使用全局浮动 Toast。

## 0.10.0 外观与首页

- `HomeDashboard.tsx`：Card 承载四个固定信息区，AnimatedBadge 显示邮箱未读数，Button 提供入口，课程空间入口使用 Select。
- `AppearanceSettings.tsx`：Button 作为可选择的风格卡片，使用 aria-pressed 表达当前选择。外观令牌由 `appearance.css` 覆盖，复用现有 BeUI 组件。
- 侧栏将邮箱放在首页之后，未读数即时更新；动态中的邮件可跳转到具体正文。

## 0.11 使用位置

- 设置使用 Button 分类导航，右侧直接展示完整设置组；通知控件使用 Switch、Select、Button。
- 侧栏继续使用 Animated Sidebar，分为日常、学习和工具。
- Office 查看器使用 Button 翻页与缩放、Loader 显示解析状态；错误使用全局 Toast。
- 设置组已替换原折叠结构，`SettingsGroups.tsx` 不再使用 Bouncy Accordion。

## 0.11.1 首页

- 摘要条统一外框与四项分隔；页首 BeUI Select 打开课程空间。
- 移除底部重复入口；窄窗口 SidebarTrigger 显式显示导航图标。

- `AppUpdater.tsx`：Button 用于检查、安装、重启与发布入口；Loader 用于更新检查和安装状态。

- `Settings.tsx`：使用已有 Switch 控制关闭主窗口后驻留托盘，样式与其他偏好保持一致。

## Android

`bottom-sheet` 来自 BeUI 公开 MCP；用于 `MobileNavigation.tsx` 的更多功能入口与 `ResourceExplorer.tsx` 的手机文件详情。触控布局沿用现有 Button、Input、Select、Checkbox、Tabs 与浮动 Toast。

## Android 0.14.1

手机布局参考 [BeUI Native](https://beui.dev/react-native) 的 Card、Tabs、Button 设计语言，在现有 Tauri WebView 中组合对应 React 组件。`MobileWeekSchedule.tsx` 使用 BottomSheet 展示课程格子的完整信息；`Mail.tsx` 使用 segment Tabs 切换收件箱、未读与已发送，选择后才出现 Checkbox 批量操作；`SettingsGroups.tsx` 使用列表进入分类详情。布局与字号说明见 [Android 界面设计](android-ui.md)。

`SelectItem` 的文字标签支持数值与字符串混排，保证 `{value} 分钟` 等选项在关闭状态仍显示单位。

`Grades.tsx` 的手机成绩使用 Collapsible 按学期分组，Input 搜索课程，Select 切换学期；保留原始成绩文字，详情展示评分明细。桌面沿用独立列成绩表格。

## Android 0.14.2

新增公开 registry 源码 `pull-to-refresh` 与 `swipeable-list`，依赖现有 Motion、clsx 和 tailwind-merge。组件清单记录在 `beui.components.json`，共享 `ease`、`touch` 和 `utils` 保留本项目版本。

- `MobileRefreshSurface.tsx` 将 Pull to Refresh 用作主滚动区或邮箱列表，复用业务刷新回调。支持 main 语义；仅在识别到拖动后捕获鼠标／触笔指针，保留内容控件的点按和输入。
- `Mail.tsx` 使用 Swipeable List 展示已读／未读操作，滑动与选择模式分开；已有底部 Tabs、Button、Checkbox 与 Toast 继续使用。
- `FileActionsSheet.tsx` 使用 BottomSheet 与 Button 组合文件操作；系统文件选择继续由 File Upload 调用。
- 表单关闭确认继续使用 Modal 与 Button，桌面未启用手机编辑确认。

文件操作 BottomSheet 使用高于编辑对话框的层级；Center Morph Modal 的键盘导航仅响应当前前景对话框，并尊重已处理的事件，保证菜单和文档预览可逐层关闭。

## Android 0.15.0

- `MobileTopBar`、`Applications`、`MobileHome`：组合 BeUI Button 与 Card，统一手机标题、入口、课程卡片和邮件列表。
- `MobileDetailPage` 承载文档、作业、课程、成绩和搜索等长内容；底部短操作继续使用 BottomSheet，放弃编辑与移除账号继续使用 Center Morph Modal。
- `MobileWeekSchedule` 支持左右触屏滑动切周，Tabs 等分排列；数据和课程详情沿用既有接口。
