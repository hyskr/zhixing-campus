import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { updateManifest } from "./update-manifest";
it("四个平台均使用已上传资源和对应签名；缺少任一平台不发布清单", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "campus-update-"));
  try {
    const names = [
      "aarch64-apple-darwin.app.tar.gz",
      "x86_64-apple-darwin.app.tar.gz",
      "x86_64-pc-windows-msvc-setup.exe",
      "x86_64-unknown-linux-gnu.AppImage",
    ].map((suffix) => `zhixing-campus_0.12.0_${suffix}`);
    for (const name of names)
      await writeFile(
        path.join(directory, name + ".sig"),
        `signature:${name}\n`,
      );
    const release = {
      tag_name: "v0.12.0",
      body: "更新说明",
      created_at: "2026-10-23T00:00:00Z",
      published_at: null,
      assets: names.map((name) => ({
        name,
        browser_download_url: `https://github.com/hyskr/zhixing-campus/releases/download/untagged-draft/${name}`,
      })),
    };
    const manifest = await updateManifest(release, directory);
    expect(Object.keys(manifest.platforms)).toEqual([
      "darwin-aarch64",
      "darwin-x86_64",
      "windows-x86_64",
      "linux-x86_64",
    ]);
    expect(manifest.platforms["darwin-aarch64"].url).toContain(
      "/releases/download/v0.12.0/",
    );
    expect(manifest.platforms["windows-x86_64"].signature).toContain(
      "-setup.exe",
    );
    await expect(
      updateManifest(
        { ...release, assets: release.assets.slice(1) },
        directory,
      ),
    ).rejects.toThrow("Missing release asset");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
