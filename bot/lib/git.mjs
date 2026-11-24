import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SENSITIVE = /(^|\/)(secrets?|\.env|providers\.env|service\.json|id_rsa|id_ed25519|.*\.pem|.*\.key|.*\.pfx)$/i;

function gitEnv(config) {
  const exe = config.gitExe || "git";
  const dir = existsSync(exe) ? dirname(exe) : "";
  const root = dir ? dirname(dir) : "";
  const pathParts = [dir, `${root}\\mingw64\\bin`, `${root}\\ucrt64\\bin`, process.env.PATH || ""];
  return {
    ...process.env,
    PATH: pathParts.filter(Boolean).join(";"),
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
  };
}

export async function runGit(config, cwd, args, timeout = 60000) {
  const exe = existsSync(config.gitExe || "") ? config.gitExe : "git";
  try {
    const { stdout, stderr } = await execFileAsync(exe, args, {
      cwd,
      env: gitEnv(config),
      windowsHide: true,
      timeout,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() };
  } catch (error) {
    const message = [error.stderr, error.stdout, error.message].filter(Boolean).join("\n").trim();
    throw new Error(message.slice(0, 2000));
  }
}

export async function repoInfo(config, cwd) {
  try {
    const root = (await runGit(config, cwd, ["rev-parse", "--show-toplevel"], 15000)).stdout;
    const [branch, status, last] = await Promise.all([
      runGit(config, cwd, ["branch", "--show-current"], 10000).then((r) => r.stdout).catch(() => ""),
      runGit(config, cwd, ["status", "--porcelain=v1", "-b"], 20000).then((r) => r.stdout),
      runGit(config, cwd, ["log", "-1", "--oneline"], 10000).then((r) => r.stdout).catch(() => ""),
    ]);
    const lines = status.split(/\r?\n/).filter(Boolean);
    const head = lines[0] || "";
    const files = lines.slice(1);
    const ahead = Number(head.match(/ahead (\d+)/)?.[1] || 0);
    const behind = Number(head.match(/behind (\d+)/)?.[1] || 0);
    return {
      repo: true,
      root,
      branch: branch || "(detached)",
      head,
      dirty: files.length,
      files: files.slice(0, 12),
      ahead,
      behind,
      last,
    };
  } catch (error) {
    return { repo: false, error: error.message };
  }
}

export async function commitAll(config, cwd, message) {
  const status = await runGit(config, cwd, ["status", "--porcelain=v1"], 20000);
  const paths = status.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).split(" -> ").pop().trim());
  const bad = paths.filter((path) => SENSITIVE.test(path.replaceAll("\\", "/")));
  if (bad.length) throw new Error(`Заблокировано: похоже на секреты — ${bad.join(", ")}`);
  if (!paths.length) return "Нечего коммитить: рабочее дерево чистое.";
  await runGit(config, cwd, ["add", "-A"], 30000);
  const result = await runGit(config, cwd, ["commit", "-m", message], 60000);
  return result.stdout || "Коммит создан.";
}

export async function push(config, cwd) {
  return (await runGit(config, cwd, ["push"], 120000)).stdout || "Отправлено.";
}

export async function pull(config, cwd) {
  return (await runGit(config, cwd, ["pull", "--ff-only"], 120000)).stdout || "Обновлено.";
}

export async function history(config, cwd, limit = 10) {
  return (await runGit(config, cwd, ["log", `-${limit}`, "--oneline", "--decorate"], 15000)).stdout;
}

export async function branches(config, cwd) {
  return (await runGit(config, cwd, ["branch", "-vv"], 15000)).stdout;
}
