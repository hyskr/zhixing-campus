import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const binary = path.resolve(
  process.argv[2] ??
    `src-tauri/target/debug/zhixing${process.platform === "win32" ? ".exe" : ""}`,
);
const directory = mkdtempSync(path.join(tmpdir(), "zhixing-cli-"));
let count = 0;
function check(
  args: string[],
  exit = 0,
  env?: Record<string, string | undefined>,
) {
  const result = Bun.spawnSync(
    [binary, ...args, "--output", "json", "--data-dir", directory],
    { env: env ?? process.env, stdout: "pipe", stderr: "pipe" },
  );
  const body = JSON.parse(new TextDecoder().decode(result.stdout));
  if (
    result.exitCode !== exit ||
    body.schema_version !== 1 ||
    body.ok !== (exit === 0)
  )
    throw Error(`CLI contract failed: ${args.join(" ")} (${result.exitCode})`);
  count++;
  return body;
}
try {
  for (const args of [
    ["schema"],
    ["schema", "homework", "show"],
    ["--version"],
    ["account", "list"],
  ])
    check(args);
  for (const args of [
    ["--bad"],
    ["mail", "inbox", "--bogus", "x"],
    ["account", "list", "--week", "2"],
    ["auth", "login", "--storage", "bogus"],
    ["mail", "mark-read", "--confirm=false"],
    ["auth", "login", "--password-stdin", "--saved-password"],
  ])
    check(args, 2);
  check(["auth", "status", "--account", "10001"], 3);
  check(["auth", "logout", "--account", "10001"], 5);
  if (process.platform !== "win32") {
    const env = { ...process.env, HOME: directory, SHELL: "/bin/zsh" };
    check(["cli", "install"], 0, env);
    check(["cli", "install"], 0, env);
    if (
      readFileSync(path.join(directory, ".zprofile"), "utf8").split(
        "export PATH=",
      ).length !== 2
    )
      throw Error("Repeated installation duplicated PATH entry");
    const linked = Bun.spawnSync(
      [path.join(directory, ".local/bin/zhixing"), "--version"],
      { env, stdout: "pipe", stderr: "pipe" },
    );
    if (linked.exitCode !== 0)
      throw Error("Installed command is not executable");
    count++;
  }
  console.log(`${count} CLI contract and installation checks passed`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
