import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Store, loadJson } from "./lib/store.mjs";
import { Telegram } from "./lib/telegram.mjs";
import { ServiceManager } from "./lib/opencode.mjs";
import { Presence } from "./lib/presence.mjs";
import { handleUpdate } from "./lib/handlers.mjs";
import { sleep } from "./lib/format.mjs";

const root = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, "");
const logPath = join(root, "bot.log");
const pidPath = join(root, "bot.pid");

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    appendFileSync(logPath, line, "utf8");
  } catch {}
}

function readEnv() {
  const candidates = [
    join(root, "secrets", "bot.env"),
    join(root, "..", "opencode-portable", "secrets", "telegram.env"),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const env = {};
    for (const line of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const index = trimmed.indexOf("=");
      env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
    return env;
  }
  return {};
}

const config = loadJson(join(root, "config.json"), {});
const env = readEnv();
config.root = root;
config.allowedUsername = env.TELEGRAM_ALLOWED_USERNAME || config.allowedUsername;
config.allowedId = env.TELEGRAM_ALLOWED_ID || config.allowedId || null;
config.token = env.TELEGRAM_BOT_TOKEN;

if (!config.token) {
  log("FATAL: TELEGRAM_BOT_TOKEN not found");
  process.exit(1);
}

const store = new Store(join(root, "state.json"), { offset: 0, chats: {}, servicePath: null });
for (const chat of Object.values(store.data.chats)) {
  chat.running = false;
  chat.mode = null;
  chat.wizard = null;
  chat.menu = null;
}
store.save();
const service = new ServiceManager(config, store);
const tg = new Telegram(config.token);
const ctx = { config, store, service, tg, log };
ctx.presence = new Presence(ctx);

const commands = [
  { command: "start", description: "Главное меню" },
  { command: "sessions", description: "Сессии" },
  { command: "new", description: "Новая сессия" },
  { command: "model", description: "Выбрать модель" },
  { command: "agent", description: "Выбрать агента / план" },
  { command: "report", description: "Отчёт по сессии" },
  { command: "git", description: "Git: статус, коммит, пуш" },
  { command: "connections", description: "Провайдеры и MCP" },
  { command: "service", description: "Сервис OpenCode" },
  { command: "status", description: "Статус" },
  { command: "btw", description: "Вклиниться в работу" },
  { command: "stop", description: "Остановить генерацию" },
  { command: "task", description: "Задача с телефона" },
  { command: "help", description: "Помощь" },
];

async function main() {
  writeFileSync(pidPath, String(process.pid), "utf8");
  const me = await tg.getMe().catch((error) => {
    log(`getMe failed: ${error.message}`);
    return null;
  });
  log(`started pid=${process.pid} bot=@${me?.username ?? "?"} user=${config.allowedUsername ?? "?"}`);
  await tg.setCommands(commands).catch((error) => log(`setCommands failed: ${error.message}`));
  const firstChat = Object.keys(store.data.chats)[0];
  if (firstChat) ctx.presence.start(firstChat);

  for (;;) {
    try {
      const updates = await tg.getUpdates(store.data.offset);
      if (!Array.isArray(updates) || !updates.length) continue;
      for (const update of updates) {
        store.data.offset = update.update_id + 1;
        try {
          await handleUpdate(ctx, update);
        } catch (error) {
          log(`update ${update.update_id} failed: ${error?.stack || error}`);
        }
        store.save();
      }
    } catch (error) {
      log(`poll failed: ${error?.message || error}`);
      await sleep(5000);
    }
  }
}

function shutdown() {
  try {
    rmSync(pidPath, { force: true });
    store.save();
    log("stopped");
  } catch {}
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("unhandledRejection", (error) => log(`unhandled: ${error?.stack || error}`));

main().catch((error) => {
  log(`FATAL: ${error?.stack || error}`);
  rmSync(pidPath, { force: true });
  process.exit(1);
});
