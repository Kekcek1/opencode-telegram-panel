import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const limit = 50 * 1024 * 1024;

function readEnv(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return env;
}

const env = readEnv(resolve(root, "secrets", "bot.env"));
const token = env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN не найден в secrets/bot.env");
  process.exit(1);
}

let chatId = process.env.TELEGRAM_CHAT_ID || env.TELEGRAM_CHAT_ID || env.TELEGRAM_ALLOWED_ID;
if (!chatId) {
  try {
    const state = JSON.parse(readFileSync(resolve(root, "state.json"), "utf8"));
    chatId = state.live?.chatId ?? Object.keys(state.chats ?? {})[0];
  } catch {}
}
if (!chatId) {
  console.error("Не найден Telegram chat id");
  process.exit(1);
}

const args = process.argv.slice(2);
const value = args[0];
if (!value) {
  console.error("Использование: tg-send.cmd <путь к файлу> [подпись]");
  process.exit(1);
}

const path = resolve(value);
if (!existsSync(path) || !statSync(path).isFile()) {
  console.error(`Файл не найден: ${path}`);
  process.exit(1);
}
const normalized = path.replaceAll("\\", "/").toLowerCase();
if (/(^|\/)secrets\//.test(normalized) || /(^|\/)[^/]*\.env$/.test(normalized) || /(^|\/)(service\.json|id_rsa|id_ed25519)$/.test(normalized) || /\.(pem|key|pfx|p12)$/.test(normalized)) {
  console.error("Файл похож на секрет, отправка заблокирована");
  process.exit(1);
}
const size = statSync(path).size;
if (size > limit) {
  console.error(`Файл больше 50 МБ: ${(size / 1024 ** 2).toFixed(1)} МБ`);
  process.exit(1);
}

const caption = args.slice(1).join(" ") || `📎 ${basename(path)}`;
const form = new FormData();
form.append("chat_id", String(chatId));
form.append("document", new Blob([readFileSync(path)]), basename(path));
form.append("caption", caption);

const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
  method: "POST",
  body: form,
  signal: AbortSignal.timeout(120000),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`Telegram: ${body.description || response.status}`);
  process.exit(1);
}

console.log(`✅ Файл отправлен: ${basename(path)} (message_id ${body.result?.message_id ?? "?"})`);
