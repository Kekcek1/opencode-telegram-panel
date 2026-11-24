import { existsSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { esc } from "./format.mjs";

const SEND_INTENT =
  /(пришл|отправ|скин|перешл|загрузи|файл|документ|архив|скрин|photo|file|document|attachment|pdf|docx?|xlsx?|zip|7z|rar)/i;
const WINDOWS_PATH = /[A-Za-z]:[\\/][^\s<>"|?*\r\n]+/g;
const QUOTED_PATH = /[`'"]([A-Za-z]:[\\/][^`'"\r\n]+)[`'"]/g;
const MARKER = /\[\[send-file:\s*([^\]]+)\]\]/gi;


export function wantsFile(text) {
  return SEND_INTENT.test(String(text ?? ""));
}

function clean(value) {
  return String(value ?? "")
    .trim()
    .replace(/^[([{`'"]+/, "")
    .replace(/[)\]}`'",.;:!?]+$/, "")
    .trim();
}

export function extractPaths(text) {
  const source = String(text ?? "");
  const found = [];
  for (const match of source.matchAll(MARKER)) found.push(clean(match[1]));
  for (const match of source.matchAll(QUOTED_PATH)) found.push(clean(match[1]));
  for (const match of source.matchAll(WINDOWS_PATH)) found.push(clean(match[0]));
  const unique = [...new Set(found.filter(Boolean))];
  return unique.filter((path) => !unique.some((other) => other !== path && other.startsWith(`${path} `)));
}

export function resolveFile(value, directory) {
  const path = clean(value);
  if (!path || path.includes("\n")) return null;
  const absolute = isAbsolute(path) ? path : resolve(directory || process.cwd(), path);
  try {
    if (!existsSync(absolute)) return null;
    if (!statSync(absolute).isFile()) return null;
    return absolute;
  } catch {
    return null;
  }
}

function toolPath(part) {
  const input = part.state?.input ?? {};
  return input.path ?? input.filePath ?? input.file ?? null;
}

export function collectPromptFiles({ messages, directory, promptText, started = 0 }) {
  const source = String(promptText ?? "");
  const marker = source.toLowerCase().includes("[[send-file:");
  const intent = wantsFile(source) || marker;
  const candidates = [];
  if (intent) {
    for (const path of extractPaths(source)) candidates.push({ path, priority: 0 });
  }
  for (const message of messages ?? []) {
    if ((message.time?.created ?? 0) < started - 3000) continue;
    for (const part of message.content ?? []) {
      if (part.type === "tool" && intent) {
        const path = toolPath(part);
        if (path) candidates.push({ path, priority: 1 });
        for (const file of part.state?.metadata?.files ?? []) {
          if (file?.file) candidates.push({ path: file.file, priority: 1 });
        }
      }
      if (part.type === "text" && (intent || String(part.text).toLowerCase().includes("[[send-file:"))) {
        for (const path of extractPaths(part.text)) candidates.push({ path, priority: 2 });
      }
    }
  }

  const seen = new Set();
  const files = [];
  for (const candidate of candidates.sort((a, b) => a.priority - b.priority)) {
    const path = resolveFile(candidate.path, directory);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    files.push(path);
    if (files.length >= 4) break;
  }
  return files;
}

export function isSensitivePath(path) {
  const normalized = String(path ?? "").replaceAll("\\", "/").toLowerCase();
  if (/(^|\/)secrets\//.test(normalized)) return true;
  if (/(^|\/)[^/]*\.env$/.test(normalized)) return true;
  if (/(^|\/)(service\.json|id_rsa|id_ed25519)$/.test(normalized)) return true;
  return /\.(pem|key|pfx|p12)$/.test(normalized);
}

export async function sendFileCommand(ctx, chatId, arg) {
  if (!arg) {
    await ctx.tg.send(chatId, "Напиши путь к файлу после /send.");
    return null;
  }
  const sent = await sendPath(ctx, chatId, arg.replace(/^["']|["']$/g, ""));
  if (sent) await ctx.tg.send(chatId, `📎 Отправлен: <code>${esc(sent.path)}</code>`);
  return sent;
}

export async function sendPath(ctx, chatId, value, options = {}) {
  const path = resolveFile(value, options.directory);
  if (!path) {
    if (options.quiet !== true) {
      await ctx.tg.send(chatId, `⚠️ Файл не найден: <code>${esc(value)}</code>`);
    }
    return null;
  }
  if (isSensitivePath(path)) {
    await ctx.tg.send(chatId, `🔒 Файл похож на секрет, отправка заблокирована: <code>${esc(basename(path))}</code>`);
    return null;
  }
  const caption = options.caption ?? `📎 <b>${esc(basename(path))}</b>`;
  try {
    const id = await ctx.tg.sendDocument(chatId, path, caption);
    return { id, path };
  } catch (error) {
    await ctx.tg.send(chatId, `⚠️ Не удалось отправить <code>${esc(basename(path))}</code>\n${esc(error?.message || error)}`);
    return null;
  }
}
