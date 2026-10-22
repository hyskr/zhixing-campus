import { encryptSsoPassword } from "../src/ssoCrypto";
// 密码只经标准输入进入当前进程，不接收命令行密码，不记录输入。
try {
  const value = JSON.parse(await Bun.stdin.text());
  const encrypted = await encryptSsoPassword(value.password, value.publicKey);
  process.stdout.write(JSON.stringify({ encrypted }));
} catch {
  process.stderr.write("SSO 密码加密失败\n");
  process.exitCode = 1;
}
