import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

let configuredPath = null;
let cache = null;

export function configurePrefs(path) {
  configuredPath = path;
  cache = null;
}

export function modelKey(model) {
  return `${model.providerID}/${model.id}`;
}

export function modelRef(model) {
  return {
    providerID: model.providerID,
    id: model.id,
    ...(model.variant ? { variant: model.variant } : {}),
  };
}

export function prefsPath(store) {
  return configuredPath ?? join(dirname(store.path), "data", "favorites.json");
}

function empty() {
  return { version: 1, favorites: {}, hidden: [] };
}

function normalize(data) {
  const next = data && typeof data === "object" ? data : empty();
  next.version = 1;
  next.favorites = next.favorites && typeof next.favorites === "object" ? next.favorites : {};
  next.hidden = Array.isArray(next.hidden) ? next.hidden : [];
  return next;
}

function write(store, data) {
  const path = prefsPath(store);
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  try {
    renameSync(temp, path);
  } catch {
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    rmSync(temp, { force: true });
  }
  cache = { path, data };
}

function migrate(store) {
  const data = empty();
  const legacy = store.data?.modelPrefs ?? {};
  const legacyFavorites = Array.isArray(legacy.favorites) ? legacy.favorites : [];
  for (const key of legacyFavorites) {
    data.favorites[String(key)] = { added: Date.now(), note: "" };
  }
  data.hidden = Array.isArray(legacy.hidden) ? [...legacy.hidden] : [];
  return data;
}

function read(store) {
  const path = prefsPath(store);
  if (cache?.path === path) return cache.data;
  let data = null;
  try {
    data = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch {}
  if (!data) {
    data = migrate(store);
    write(store, data);
  } else {
    data = normalize(data);
    cache = { path, data };
  }
  return data;
}

export function prefs(store) {
  return read(store);
}

export function favoriteEntry(store, model) {
  return read(store).favorites[modelKey(model)] ?? null;
}

export function isFavorite(store, model) {
  return Boolean(favoriteEntry(store, model));
}

export function isHidden(store, model) {
  return read(store).hidden.includes(modelKey(model));
}

export function noteOf(store, model) {
  return favoriteEntry(store, model)?.note ?? "";
}

export function decorate(store, models) {
  return models.map((model) => ({
    ...model,
    favorite: isFavorite(store, model),
    hidden: isHidden(store, model),
    note: noteOf(store, model),
  }));
}

export function visible(store, models) {
  return decorate(store, models).filter((model) => !model.hidden);
}

export function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export function toggleFavorite(store, model) {
  const data = read(store);
  const key = modelKey(model);
  if (data.favorites[key]) {
    delete data.favorites[key];
  } else {
    data.favorites[key] = {
      added: Date.now(),
      note: "",
      name: model.name ?? model.id,
    };
  }
  write(store, data);
  return Boolean(data.favorites[key]);
}

export function toggleHidden(store, model) {
  const data = read(store);
  const key = modelKey(model);
  data.hidden = toggle(data.hidden, key);
  write(store, data);
  return data.hidden.includes(key);
}

export function setNote(store, model, note) {
  const data = read(store);
  const key = modelKey(model);
  data.favorites[key] ??= { added: Date.now(), name: model.name ?? model.id };
  data.favorites[key].note = String(note ?? "").trim();
  write(store, data);
  return data.favorites[key].note;
}

export function favoriteCount(store) {
  return Object.keys(read(store).favorites).length;
}

export function favoriteModels(store, models) {
  return decorate(store, models).filter((model) => model.favorite && !model.hidden);
}
