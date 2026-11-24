import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const FILE = "plugin.commandcode.sessions.session-folders.json";
const CHANNELS = ["latest", "dev", "beta", "stable"];

export function foldersFile(oc) {
  if (!oc?.statePath) return null;
  const base = dirname(oc.statePath);
  for (const channel of CHANNELS) {
    const path = join(base, channel, "tui", FILE);
    if (existsSync(path)) return path;
  }
  return join(base, "latest", "tui", FILE);
}

export function emptyFolders() {
  return {
    recentOpen: true,
    narrowOpen: true,
    forceNarrow: false,
    order: [],
    sessions: {},
    expanded: {},
  };
}

function normalize(value) {
  const data = value && typeof value === "object" ? value : emptyFolders();
  data.order = Array.isArray(data.order) ? data.order.filter((name) => typeof name === "string" && name.trim()) : [];
  data.sessions = data.sessions && typeof data.sessions === "object" ? data.sessions : {};
  data.expanded = data.expanded && typeof data.expanded === "object" ? data.expanded : {};
  for (const name of Object.keys(data.sessions)) {
    if (!data.order.includes(name)) data.order.push(name);
    data.sessions[name] = Array.isArray(data.sessions[name])
      ? [...new Set(data.sessions[name].filter((id) => typeof id === "string" && id))]
      : [];
  }
  for (const name of data.order) {
    data.sessions[name] ??= [];
  }
  return data;
}

export function readFolders(oc) {
  const path = foldersFile(oc);
  if (!path) return emptyFolders();
  try {
    return normalize(JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")));
  } catch {
    return emptyFolders();
  }
}

export function writeFolders(oc, value) {
  const path = foldersFile(oc);
  if (!path) throw new Error("Не найден state сервиса OpenCode");
  const data = normalize(value);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(data), "utf8");
  try {
    renameSync(temp, path);
  } catch {
    writeFileSync(path, JSON.stringify(data), "utf8");
    rmSync(temp, { force: true });
  }
  return data;
}

export function groupNames(data) {
  return normalize(data).order;
}

export function groupOf(data, id) {
  const value = normalize(data);
  for (const name of value.order) {
    if (value.sessions[name]?.includes(id)) return name;
  }
  return null;
}

export function groupCounts(data) {
  const value = normalize(data);
  return value.order.map((name) => ({ name, count: value.sessions[name]?.length ?? 0 }));
}

export function assignGroup(oc, id, name) {
  const data = readFolders(oc);
  for (const group of data.order) {
    data.sessions[group] = (data.sessions[group] ?? []).filter((item) => item !== id);
  }
  const target = String(name ?? "").trim();
  if (target) {
    if (!data.order.includes(target)) data.order.push(target);
    data.sessions[target] ??= [];
    if (!data.sessions[target].includes(id)) data.sessions[target].push(id);
    data.expanded[target] = true;
  }
  return writeFolders(oc, data);
}

export function removeSession(oc, id) {
  const data = readFolders(oc);
  for (const group of data.order) {
    data.sessions[group] = (data.sessions[group] ?? []).filter((item) => item !== id);
  }
  return writeFolders(oc, data);
}

export function createGroup(oc, name) {
  const value = String(name ?? "").trim();
  if (!value) throw new Error("Название группы пустое");
  const data = readFolders(oc);
  if (!data.order.includes(value)) data.order.push(value);
  data.sessions[value] ??= [];
  data.expanded[value] = true;
  return writeFolders(oc, data);
}

export function renameGroup(oc, from, to) {
  const value = String(to ?? "").trim();
  if (!value) throw new Error("Название группы пустое");
  const data = readFolders(oc);
  if (!data.order.includes(from)) return data;
  if (from !== value && data.order.includes(value)) throw new Error(`Группа «${value}» уже есть`);
  data.order = data.order.map((name) => (name === from ? value : name));
  data.sessions[value] = data.sessions[from] ?? [];
  if (from !== value) delete data.sessions[from];
  if (from !== value) delete data.expanded[from];
  data.expanded[value] = true;
  return writeFolders(oc, data);
}

export function deleteGroup(oc, name) {
  const data = readFolders(oc);
  data.order = data.order.filter((item) => item !== name);
  delete data.sessions[name];
  delete data.expanded[name];
  return writeFolders(oc, data);
}

export function sessionsInGroup(oc, name) {
  const data = readFolders(oc);
  return [...(data.sessions[name] ?? [])];
}

export function ungroupedSessions(oc, sessions) {
  const data = readFolders(oc);
  const grouped = new Set(Object.values(data.sessions).flat());
  return sessions.filter((session) => !grouped.has(session.id));
}
