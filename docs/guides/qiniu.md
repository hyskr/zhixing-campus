# 七牛发布备份

项目使用七牛官方 [qshell](https://github.com/qiniu/qshell) 管理发布文件。公开 Bucket 为 `zhixing-campus-releases-hyskr`，区域华东 z0。

## 自动镜像

桌面、Android 和界面 Release 发布完成后，分别调用 Mirror release to Qiniu 工作流。文件保留原始内容，上传至：

`zhixing-campus/releases/<tag>/<文件名>`

安装包、前端归档、签名、清单和 Release 附带文档一并备份。重跑覆盖相同对象，不改写签名内容。镜像失败会在独立任务报错，不撤销已经发布的 GitHub Release。

也可手动启动工作流，填写已发布的 tag；用于补传旧版本。认证使用 GitHub Secrets `QINIU_ACCESS_KEY`、`QINIU_SECRET_KEY`；空间名使用 Repository Variable `QINIU_BUCKET`。本机 qshell 的账号配置不进入仓库。

## 下载域名

当前 Bucket 只有七牛测试域名。七牛测试域名禁止下载 APK、EXE、DMG 等安装包，且 30 天后回收，不能用作应用更新地址。来源：[测试域名规范](https://developer.qiniu.com/fusion/kb/1319/test-domain-access-restriction-rules)。

计划使用 `downloads.radam.cc`。当前七牛拒绝该域名绑定，返回 400078（未备案的海外域名，对七牛资源的使用错误）；需补齐备案与域名接入条件。绑定自有 HTTPS 域名并配置 DNS、证书后，再切换客户端更新地址。切换时需将桌面和 Android 清单内的下载 URL 改为七牛对象地址；界面归档 URL 也需使用七牛地址重新生成签名清单。旧安装包内置的更新地址仍需保留，供用户升级到新客户端。

域名就绪前，七牛仅作文件备份，应用继续使用现有更新通道。
