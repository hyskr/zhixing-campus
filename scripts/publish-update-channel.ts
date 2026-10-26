import { readFileSync } from "node:fs";
const repository =
  process.env.GH_REPO ??
  process.env.GITHUB_REPOSITORY ??
  "hyskr/zhixing-campus";
const args = process.argv.slice(2);
if (!args.length || args.length % 2)
  throw Error(
    "Usage: bun scripts/publish-update-channel.ts <source> <channel-path> ...",
  );
const files = [];
for (let i = 0; i < args.length; i += 2)
  files.push({
    path: args[i + 1],
    mode: "100644",
    type: "blob",
    content: readFileSync(args[i], "utf8"),
  });
function api(
  method: string,
  endpoint: string,
  body?: unknown,
  missing = false,
): any {
  const call = Bun.spawnSync(
    [
      "gh",
      "api",
      `repos/${repository}/${endpoint}`,
      "--method",
      method,
      ...(body ? ["--input", "-"] : []),
    ],
    {
      stdin: body ? Buffer.from(JSON.stringify(body)) : undefined,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  if (call.exitCode !== 0) {
    if (missing && new TextDecoder().decode(call.stderr).includes("404"))
      return null;
    throw Error(`GitHub update channel request failed: ${method} ${endpoint}`);
  }
  return JSON.parse(new TextDecoder().decode(call.stdout));
}
// 两个发布任务可同时更新不同通道；整批提交使清单和签名同步可见。
for (let attempt = 0; attempt < 3; attempt++) {
  const reference = api("GET", "git/ref/heads/update-channel", undefined, true),
    parent = reference?.object.sha;
  const base = parent
    ? api("GET", `git/commits/${parent}`).tree.sha
    : undefined;
  const tree = api("POST", "git/trees", {
    ...(base ? { base_tree: base } : {}),
    tree: files,
  });
  const commit = api("POST", "git/commits", {
    message: "Publish application update channel",
    tree: tree.sha,
    parents: parent ? [parent] : [],
  });
  try {
    if (parent)
      api("PATCH", "git/refs/heads/update-channel", {
        sha: commit.sha,
        force: false,
      });
    else
      api("POST", "git/refs", {
        ref: "refs/heads/update-channel",
        sha: commit.sha,
      });
    console.log(`Published ${files.map((file) => file.path).join(", ")}`);
    break;
  } catch (error) {
    if (attempt === 2) throw error;
  }
}
