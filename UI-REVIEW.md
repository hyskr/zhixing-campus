# 桌面界面检查与 0.11 改进

## 结论

知行是日常校园工作台。首页展示今日任务和消息，业务页承载完整列表；设置使用稳定的分类导航。界面风格可以切换，但字体、控件和信息优先级保持一致。

## 已修正

| 优先级 | 问题 | 当前设计 |
| --- | --- | --- |
| 高 | 同一时段存在多门课时，CSS 隐藏地点和教师 | 并排课程显示名称、地点、教师；长文本省略时可悬停查看，点击进入课程空间；保持固定行高 |
| 高 | 设置依赖折叠标题，选项位置和分组不清楚 | 外观、通知、下载与文件、登录与网络、凭据、诊断六类；左侧导航固定，右侧显示完整设置并独立滚动 |
| 中 | Claude 风格标题使用宋体，正文与组件背景来自多套颜色 | 导航和业务标题使用统一中文无衬线字体，暖纸色底、陶土色强调、语义化控件颜色 |
| 中 | 导航把文件、下载和校园服务放在同一组且缺乏顺序 | 日常：概览、邮箱、课表、作业；学习：资料、成绩、教室；工具：下载、文件空间、校园服务 |
| 中 | 较矮窗口下侧栏占用过多空间 | 减少组间距和底部状态信息，账号与设置保留固定位置 |
| 中 | 提醒设置只有邮件且缺少实际测试入口 | 同一设置页集中管理邮件、成绩、上课提醒，分别提供测试按钮 |

邮箱放在日常组第二项，强调未读消息；成绩属于周期性查询，放在学习组；下载与文件空间相邻。各组均为一级页面，设置和账号位于固定底部位置。

## 保留的结构

- 所有业务页保留紧凑单行标题和当前页刷新，首页同步全部。
- 首页保留固定邮箱与校园动态，完整数据通过对应页面访问。
- 邮箱保留目录、列表、阅读区，列表和正文各自滚动。
- 课程资料保留树内多选、文件图标和右侧预览，错误和操作结果使用浮动 Toast。

## 验证与边界

- 1440×900 与 1040×720 下课表一屏展示；同一时段三门课均保留地点和教师元素。
- 六个设置分类均展示对应内容；较矮窗口中右侧设置可滚动，外层不产生弹跳。
- 较窄课程卡片会省略长名称和地点；完整信息通过悬停和课程详情查看。
- Claude 风格是本项目的配色方案，功能和布局与经典风格一致。

## 设计依据

- [Apple Layout · Visual hierarchy](https://developer.apple.com/design/human-interface-guidelines/layout)："Group related items to clearly express related information or functions." 用分组和对齐表达关系。
- [Apple Settings · Desktop](https://developer.apple.com/design/human-interface-guidelines/settings)：设置导航保持可见并标识当前分类。
- [Apple Typography · Conveying hierarchy](https://developer.apple.com/design/human-interface-guidelines/typography)：减少字体混用，使用字重与大小表达层级。
- [Apple Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)：侧栏承担页面导航；[Claude Desktop](https://claude.com/download) 提供暖色工作区的视觉参考。

分组顺序、紧凑程度和课程信息优先级是针对本项目使用频率的设计判断。组件继续使用已安装的 BeUI Button、Switch、Select、Tabs、Tooltip 与 Sidebar。
