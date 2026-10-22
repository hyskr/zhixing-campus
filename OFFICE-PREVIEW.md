# Office 在线预览

## 实现

文件通过现有登录会话读取后，在应用 WebView 中解析，不依赖 Node 服务或本机 Office。

| 格式 | 依赖 | 用途 |
| --- | --- | --- |
| DOCX | [docx-preview 0.4.1](https://github.com/VolodymyrBaydalka/docxjs) | 保留页面、段落样式、表格、图片及页眉页脚，支持缩放与滚动阅读 |
| PPTX | [@web-ppt/core 0.4.5](https://github.com/unStone/web-ppt/tree/master/packages/core) | 本机解析幻灯片为 SVG，保留文本、形状和图片，支持逐页、缩放与全屏 |
| PDF 转换版 | 现有 PDF.js | 学校已提供 PDF 转换内容时按实际文件头识别，继续使用 PDF 查看器 |

DOCX 使用 `renderAsync` 的稳定公开接口；PPTX 使用 `parse`、`renderSlideToSvg` 和 `Presentation.dispose`。两个渲染依赖都在打开对应文件后动态加载。PPTX 预览按窗口宽高适配，放大后可滚动。

`FilePreview.tsx` 将读取结果交给 `OfficePreview.tsx`；`fileFormats.ts` 从文件名或实际链接识别后缀，文件读取失败会报告 HTTP 状态，返回登录网页时提示链接或会话问题。原有 PDF、图片、纯文本与下载功能保留。

## 选型依据

- [docx-preview 官方 API](https://github.com/VolodymyrBaydalka/docxjs#api) 提供浏览器页面布局；Mammoth 的语义 HTML 转换适合抽取正文，不能完整呈现 Word 页面。
- [Web-PPT 官方文档](https://github.com/unStone/web-ppt/blob/master/README.en.md) 提供纯浏览器解析、SVG 渲染和资源释放接口，采用 MIT 许可；核心运行时依赖为 fflate。
- [pptx-preview](https://github.com/501351981/pptx-preview) 也提供前端查看接口。本项目选择可查看完整源代码、采用 MIT 许可的 Web-PPT 核心。

许可证随项目保存在 `licenses/docx-preview.txt` 和 `licenses/web-ppt-core.txt`。

## 验证

- `src/fileFormats.test.ts` 三项测试：无后缀标题识别、Office 的 PDF 转换版、登录网页和无效内容识别。
- 真实 DOCX 包样本：两页正文、一张表格和一张 PNG 图片在浏览器内显示，图片完成解码。
- 真实 PPTX 包样本：两页文字及嵌入图片显示，前后翻页成功。
- 使用实际 `FilePreviewProvider` 打开 PPTX，验证完整幻灯片适配容器、进入全屏、全屏翻页及退出全屏。
- 示例文档位于 `public/demo/report.docx`、`public/demo/slides.pptx`；截图位于 `output/office-preview/`。

## 格式限制

DOCX 自动分页及字体替换可能与 Word 有差异；复杂版式以原文件或学校 PDF 转换版为准。PPTX 当前展示静态页，动画按最终状态显示，视频和音频显示封面。加密文档不提供密码输入，遇到加密文件可下载后使用系统应用打开。旧版二进制 PPT 走相同解析器，但未纳入本次样本验证。
