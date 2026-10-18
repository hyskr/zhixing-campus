# 第三方来源

具体功能和上游文件的对应关系见 [SOURCES.md](SOURCES.md)。参考关系与运行库许可分别记录。

学校系统访问与解析逻辑参考 HFDLYS/BJTUselfService 、fish2lab/bjtu-cli 、JasonZhang1225/BJTUselfService-KMP-Refreshed 和 s1y4x1/BJTU-course-assistant。

BJTUselfService 使用 MIT License：

Copyright (c) 2024 BJTUselfService

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

验证码模型及字符表来自 https://github.com/hyskr/bjtu-captcha-ocr 。

ONNX Runtime Web、BeUI、Motion、React、Tailwind CSS、Tauri 及其他依赖的许可证随各自发行包提供。

## 文件查看与登录

- PDF.js（pdfjs-dist）：Apache-2.0，用于 PDF 查看与本地字库、字符映射、图像解码。
- Mammoth：BSD-2-Clause，用于 DOCX 转换。
- gm-crypto：MIT，用于新版 SSO 的 SM2 加密。

完整许可文本位于 licenses/，PDF.js 自带资源的许可保留在对应目录。

## BeUI 界面组件

BeUI（starc007/ui-components）采用 MIT 许可，完整文本随项目保存在 `licenses/beui.txt`。组件源码由 https://mcp.beui.dev/mcp 获取，使用位置和改动范围见 [BEUI.md](BEUI.md)。新增组件也来自 BeUI 公共 Registry。辅助依赖包括 Motion、clsx、tailwind-merge、TanStack Virtual 和 Lenis，许可随各自发行包提供。

## 邮箱界面与排版

- 邮箱三栏界面参考 [msnabiel/shadcn-mail](https://github.com/msnabiel/shadcn-mail) 的 `components/ui/mail.tsx`、`mail-list.tsx`、`mail-display.tsx` 布局；本项目自行实现页面，不包含该项目的组件源码。
- `src/typeset.css` 来自 [shadcn/typeset](https://ui.shadcn.com/docs/typeset)，shadcn/ui 采用 MIT 许可，许可文本位于 `licenses/shadcn-ui.txt`。
- Geist 与 Geist Mono 字体包采用 SIL OFL 1.1，许可文本位于 `licenses/geist.txt`、`licenses/geist-mono.txt`。

- Lenis：MIT，BeUI 滚动进度组件辅助模块的依赖，许可见 `licenses/lenis.txt`。资料目录使用原生滚动。
