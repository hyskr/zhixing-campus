import path from "node:path";
import { readFile } from "node:fs/promises";
interface Release {
  tag_name: string;
  body: string | null;
  published_at: string | null;
  created_at: string;
  assets: { name: string; browser_download_url: string }[];
}
export async function updateManifest(release: Release, directory: string) {
  const version = release.tag_name.replace(/^v/, "");
  const platforms: Record<string, { url: string; signature: string }> = {};
  const targets = {
    "darwin-aarch64": "aarch64-apple-darwin.app.tar.gz",
    "darwin-x86_64": "x86_64-apple-darwin.app.tar.gz",
    "windows-x86_64": "x86_64-pc-windows-msvc-setup.exe",
    "linux-x86_64": "x86_64-unknown-linux-gnu.AppImage",
  };
  for (const [platform, suffix] of Object.entries(targets)) {
    const name = `zhixing-campus_${version}_${suffix}`;
    const asset = release.assets.find((asset) => asset.name === name);
    if (!asset) throw Error(`Missing release asset: ${name}`);
    const signature = (
      await readFile(path.join(directory, name + ".sig"), "utf8")
    ).trim();
    if (!signature) throw Error(`Missing signature: ${name}`);
    platforms[platform] = {
      url: asset.browser_download_url.replace(
        /\/releases\/download\/[^/]+\//,
        `/releases/download/${encodeURIComponent(release.tag_name)}/`,
      ),
      signature,
    };
  }
  return {
    version,
    notes: release.body ?? "",
    pub_date: release.published_at ?? release.created_at,
    platforms,
  };
}
if (import.meta.main) {
  const [input, directory, output] = process.argv.slice(2);
  const release = await Bun.file(input).json();
  await Bun.write(
    output,
    JSON.stringify(await updateManifest(release, directory), null, 2) + "\n",
  );
}
