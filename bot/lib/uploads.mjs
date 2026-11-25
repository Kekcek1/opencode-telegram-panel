import { mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { esc } from "./format.mjs";
import { runPrompt } from "./prompt.mjs";

const DOWNLOAD_LIMIT = 20 * 1024 * 1024;

function extension(mime, fallback) {
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "video/mp4": ".mp4",
    "application/pdf": ".pdf",
  };
  return map[mime] ?? fallback;
}

export function fileFromMessage(message) {
  if (message.document) {
    return {
      id: message.document.file_id,
      name: message.document.file_name || `document-${message.message_id}`,
      size: message.document.file_size ?? 0,
    };
  }
  if (message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    return { id: photo.file_id, name: `photo-${message.message_id}.jpg`, size: photo.file_size ?? 0 };
  }
  if (message.audio) {
    return {
      id: message.audio.file_id,
      name: message.audio.file_name || `audio-${message.message_id}${extension(message.audio.mime_type, ".mp3")}`,
      size: message.audio.file_size ?? 0,
    };
  }
  if (message.voice) {
    return {
      id: message.voice.file_id,
      name: `voice-${message.message_id}${extension(message.voice.mime_type, ".ogg")}`,
      size: message.voice.file_size ?? 0,
    };
  }
  if (message.video) {
    return {
      id: message.video.file_id,
      name: message.video.file_name || `video-${message.message_id}${extension(message.video.mime_type, ".mp4")}`,
      size: message.video.file_size ?? 0,
    };
  }
  if (message.animation) {
    return {
      id: message.animation.file_id,
      name: message.animation.file_name || `animation-${message.message_id}.mp4`,
      size: message.animation.file_size ?? 0,
    };
  }
  return null;
}

function safeName(value, fallback) {
  const name = basename(String(value || fallback))
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const withExt = extname(name) ? name : `${name}${extname(fallback) || ""}`;
  return withExt.slice(-120) || fallback;
}

export async function receiveFile(ctx, chatId, message) {
  const file = fileFromMessage(message);
  if (!file) return false;
  const chat = ctx.store.chat(chatId);
  if (!chat.activeSession) {
    await ctx.tg.send(chatId, "Сначала выбери сессию: /sessions или создай /new. Потом пришли файл снова.");
    return true;
  }
  if (file.size > DOWNLOAD_LIMIT) {
    await ctx.tg.send(chatId, `⚠️ Файл больше 20 МБ (${(file.size / 1024 ** 2).toFixed(1)} МБ). Telegram не отдаёт боту такие файлы.`);
    return true;
  }

  let progressId = null;
  let uploads = null;
  let name = null;
  let target = null;

  try {
    const oc = await ctx.service.client();
    const session = await oc.session(chat.activeSession);
    const directory = session.location?.directory || join(ctx.config.sessionRoot || "G:\\sessions", chat.activeSession);
    uploads = join(directory, "uploads");
    name = safeName(file.name, `file-${message.message_id}`);
    target = join(uploads, `${message.message_id}-${Date.now()}-${name}`);
    mkdirSync(uploads, { recursive: true });
    progressId = await ctx.tg.send(chatId, `📥 <b>Скачиваю файл</b>\n<code>${esc(name)}</code>`);
    const info = await ctx.tg.getFile(file.id);
    if (!info?.file_path) throw new Error("Telegram не вернул путь к файлу");
    const saved = await ctx.tg.download(info.file_path, target);
    await ctx.tg.edit(
      chatId,
      progressId,
      `📎 <b>Файл принят</b>\n<code>${esc(saved.path)}</code>\n<i>${(saved.size / 1024).toFixed(1)} КБ</i>`,
    );
    const caption = String(message.caption || "").trim();
    const prompt = [
      "Пользователь прислал файл:",
      saved.path,
      "",
      caption || "Прочитай файл и проанализируй его. Ответь по-русски и укажи, что удалось извлечь.",
    ].join("\n");
    await runPrompt(ctx, chatId, prompt, { label: "Анализ файла", sendFiles: false });
    return true;
  } catch (error) {
    const messageText = `❌ Не удалось принять файл: ${esc(error?.message || error)}`;
    if (progressId) await ctx.tg.edit(chatId, progressId, messageText).catch(() => {});
    else await ctx.tg.send(chatId, messageText);
    return true;
  }
}
