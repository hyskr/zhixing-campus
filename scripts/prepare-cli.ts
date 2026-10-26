import { mkdir, copyFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
const target = process.argv[2];
if (!target) throw Error("用法：bun scripts/prepare-cli.ts <target-triple>");
const extension = target.includes("windows") ? ".exe" : "";
await mkdir("src-tauri/binaries", { recursive: true });
const source = resolve(
  `src-tauri/target/${target}/release/zhixing${extension}`,
);
const destination = `src-tauri/binaries/zhixing-${target}${extension}`;
await copyFile(source, destination);
if (!extension) await chmod(destination, 0o755);
console.log(`CLI 已准备：${destination}`);
