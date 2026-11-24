import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function loadJson(path, fallback) {
  try {
    const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function saveJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export class Store {
  constructor(path, initial) {
    this.path = path;
    this.data = existsSync(path) ? loadJson(path, initial) : structuredClone(initial);
    this.data.chats ??= {};
    this.data.offset ??= 0;
    this.data.servicePath ??= null;
  }

  save() {
    saveJson(this.path, this.data);
  }

  chat(id) {
    const key = String(id);
    this.data.chats[key] ??= {
      activeSession: null,
      running: false,
      mode: null,
      menu: null,
      wizard: null,
    };
    return this.data.chats[key];
  }
}
