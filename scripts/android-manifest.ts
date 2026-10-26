import { statSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
export function androidManifest(
  version: string,
  versionCode: number,
  size: number,
  tag: string,
  notes: string,
  date = new Date().toISOString(),
) {
  if (tag !== `android-v${version}` || !/^\d+\.\d+\.\d+$/.test(version))
    throw Error("Android release requires a stable version tag");
  if (!Number.isSafeInteger(versionCode) || versionCode <= 0 || size <= 0)
    throw Error("APK metadata is invalid");
  const base = "https://github.com/hyskr/zhixing-campus/releases";
  return {
    version,
    versionCode,
    notes,
    date,
    size,
    url: `${base}/tag/${tag}`,
    apkUrl: `${base}/download/${tag}/zhixing-campus_${version}_android-arm64.apk`,
  };
}
if (import.meta.main) {
  const apk = process.argv[2],
    tag = process.env.GITHUB_REF_NAME;
  if (!apk || !tag) throw Error("APK path and GITHUB_REF_NAME are required");
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const aapt = path.join(process.env.ANDROID_HOME!, "build-tools/36.0.0/aapt");
  const result = spawnSync(aapt, ["dump", "badging", apk], {
    stdio: "pipe",
  });
  if (result.status !== 0) throw Error("Unable to read APK version");
  const info = new TextDecoder().decode(result.stdout),
    code = Number(info.match(/versionCode='(\d+)'/)?.[1]);
  if (
    !info.includes("name='cn.zhixing.bjtu'") ||
    !info.includes(`versionName='${version}'`)
  )
    throw Error("APK identity does not match the release");
  const notesPath = `docs/releases/android-${version}.md`;
  const notes = existsSync(notesPath)
    ? readFileSync(notesPath, "utf8")
    : `知行 Campus Android ${version}`;
  writeFileSync(
    "output/android/android.json",
    JSON.stringify(
      androidManifest(version, code, statSync(apk).size, tag, notes),
      null,
      2,
    ) + "\n",
  );
}
