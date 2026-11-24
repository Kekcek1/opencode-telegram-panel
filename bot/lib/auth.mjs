import { appendFileSync } from "node:fs";
import { join } from "node:path";

export function allowed(config, from) {
  const id = config.allowedId ? String(config.allowedId) : "";
  const username = String(config.allowedUsername || "").replace(/^@/, "").toLowerCase();
  if (id) return String(from.id) === id;
  return Boolean(username && String(from.username || "").toLowerCase() === username);
}

export function logAccess(config, from, text) {
  try {
    appendFileSync(
      join(config.root, "access.log"),
      `${new Date().toISOString()} id=${from.id} username=@${from.username || "-"} text=${JSON.stringify(String(text || "").slice(0, 200))}\n`,
      "utf8",
    );
  } catch {}
}
