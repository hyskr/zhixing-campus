const host = Bun.spawnSync(["rustc", "-vV"], {
  stdout: "pipe",
  stderr: "inherit",
});
if (host.exitCode !== 0) process.exit(host.exitCode);
const target = new TextDecoder()
  .decode(host.stdout)
  .match(/^host: (.+)$/m)?.[1];
if (!target) throw Error("无法确定本机 Rust 架构");
const args = process.argv.slice(2);
const targetAt = args.indexOf("--target");
const buildTarget = targetAt >= 0 ? args[targetAt + 1] : target;
if (!buildTarget) throw Error("--target 缺少架构参数");
for (const command of [
  ["bun", "run", "build"],
  [
    "cargo",
    "build",
    "--release",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--features",
    "cli",
    "--bin",
    "zhixing",
    "--target",
    buildTarget,
  ],
  ["bun", "scripts/prepare-cli.ts", buildTarget],
  [
    "bun",
    "run",
    "tauri",
    "build",
    "--config",
    "src-tauri/tauri.desktop.conf.json",
    ...args,
  ],
]) {
  const code = await Bun.spawn(command, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).exited;
  if (code !== 0) process.exit(code);
}
