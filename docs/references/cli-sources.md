# CLI 设计来源

| 来源 | 固定版本与文件 | 本项目参考范围 |
| --- | --- | --- |
| hyskr/chaoxing-go | [response.go](https://github.com/hyskr/chaoxing-go/blob/4c9396df4c745a3b1de60a9a7f999bc53f0fc02a/internal/cli/response.go)、[schema.go](https://github.com/hyskr/chaoxing-go/blob/4c9396df4c745a3b1de60a9a7f999bc53f0fc02a/internal/cli/schema.go) | stdout 单结果 JSON、stderr 进度、schema 命令、退出码和显式确认交互设计 |
| fish2lab/bjtu-cli | [README](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/README.md)、[MISService.swift](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Services/MISService.swift)、[CredentialStore.swift](https://github.com/fish2lab/bjtu-cli/blob/8a39d48d326ac195360c3564c9576d8a067aad03/Sources/bjtu/Core/CredentialStore.swift) | 按校园业务分组的命令、保存账号／会话复用和系统凭据库设计 |

`src-tauri/src/cli.rs` 以 Rust 独立实现命令层，没有复制上述 Go／Swift 源码。校园请求直接调用本项目现有 SSO、教务、课程、邮箱、回放与设备适配器，协议来源继续见各模块固定版本注释。

SM2 使用 [RustCrypto sm2 0.14](https://docs.rs/sm2/0.14.0/sm2/pke/struct.EncryptingKey.html)；默认 C1C3C2 密文移除 SEC1 的 04 前缀后 base64，与现有 `src/ssoCrypto.ts` 的学校密码格式一致。CLI 安装使用 [Tauri externalBin](https://v2.tauri.app/develop/sidecar/) 随桌面包分发。

终端表格与可读进度的交互参考 [chaoxing-go text.go](https://github.com/hyskr/chaoxing-go/blob/4c9396df4c745a3b1de60a9a7f999bc53f0fc02a/internal/cli/text.go)，由 `src-tauri/src/cli_output.rs` 独立实现，使用 [comfy-table](https://github.com/Nukesor/comfy-table) 排版。
