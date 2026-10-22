import { resolve, join } from "node:path";
import { homedir } from "node:os";
const root = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    `用法：mise run test:live -- [--account 学号] [--data-dir 路径] [--report 路径] [--reuse-session] [--all-items]\n默认读取全部已保存账号，使用已保存密码进行一次 SSO 登录，逐项测试应用的只读接口。\n--reuse-session 优先复用保存的会话；--all-items 深入读取所有作业详情和课程文件，不只抽取代表项。\n写操作不执行；邮件正文只选已读邮件，避免改变未读状态。`,
  );
  process.exit(0);
}
function option(name: string) {
  const i = args.indexOf(name);
  if (i < 0) return;
  const value = args[i + 1];
  if (!value || value.startsWith("--")) throw Error(`${name} 缺少参数`);
  return value;
}
const known = new Set([
  "--account",
  "--data-dir",
  "--report",
  "--reuse-session",
  "--all-items",
]);
for (let i = 0; i < args.length; i++) {
  if (!known.has(args[i])) throw Error(`未知参数：${args[i]}`);
  if (["--account", "--data-dir", "--report"].includes(args[i])) i++;
}
const defaultData =
  process.platform === "darwin"
    ? join(homedir(), "Library/Application Support/cn.zhixing.bjtu")
    : process.platform === "win32"
      ? join(
          process.env.APPDATA ?? join(homedir(), "AppData/Roaming"),
          "cn.zhixing.bjtu",
        )
      : join(
          process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"),
          "cn.zhixing.bjtu",
        );
const report = resolve(
  root,
  option("--report") ?? "output/live-api/report.json",
);
const child = Bun.spawn(
  [
    "cargo",
    "test",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--lib",
    "live_api::saved_account_read_suite",
    "--",
    "--ignored",
    "--nocapture",
    "--test-threads=1",
  ],
  {
    cwd: root,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      CAMPUS_PROBE_DATA: resolve(option("--data-dir") ?? defaultData),
      CAMPUS_PROBE_REPORT: report,
      CAMPUS_PROBE_ACCOUNT: option("--account") ?? "",
      CAMPUS_PROBE_REUSE: args.includes("--reuse-session") ? "1" : "0",
      CAMPUS_PROBE_ALL: args.includes("--all-items") ? "1" : "0",
      CAMPUS_PROBE_BUN: process.execPath,
      CAMPUS_PROBE_ROOT: root,
    },
  },
);
const code = await child.exited;
console.log(`报告：${report}`);
process.exitCode = code;
