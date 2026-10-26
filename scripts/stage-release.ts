import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
const target = process.argv[2];
if (!target) throw Error("Usage: bun scripts/stage-release.ts <target>");
const { version } = await Bun.file("package.json").json();
const root = `src-tauri/target/${target}/release/bundle`;
await mkdir("output/packages", { recursive: true });
const formats = [
  ["nsis/*.exe", "-setup.exe"],
  ["msi/*.msi", ".msi"],
  ["dmg/*.dmg", ".dmg"],
  ["deb/*.deb", ".deb"],
  ["appimage/*.AppImage", ".AppImage"],
  ["macos/*.app.tar.gz", ".app.tar.gz"],
];
let count = 0;
for (const [glob, suffix] of formats) {
  for await (const file of new Bun.Glob(glob).scan(root)) {
    const source = path.join(root, file);
    const destination = `output/packages/zhixing-campus_${version}_${target}${suffix}`;
    await copyFile(source, destination);
    count++;
    if (await Bun.file(source + ".sig").exists())
      await copyFile(source + ".sig", destination + ".sig");
  }
}
if (!count) throw Error(`No installers found for ${target}`);
console.log(`Staged ${count} packages for ${target}`);

const cliExtension = target.includes("windows") ? ".exe" : "";
const cliSource = `src-tauri/target/${target}/release/zhixing${cliExtension}`;
await copyFile(
  cliSource,
  `output/packages/zhixing-cli_${version}_${target}${cliExtension}`,
);
await copyFile("docs/guides/cli.md", "output/packages/CLI.md");
