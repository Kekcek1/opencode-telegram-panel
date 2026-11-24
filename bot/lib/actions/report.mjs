import { statfsSync } from "node:fs";
import { confirmDelete, helpView, reportView, serviceView, statusView } from "../ui.mjs";
import { repoInfo } from "../git.mjs";
import { clip, esc } from "../format.mjs";
import { friendlyError } from "../opencode.mjs";
import { client, chatOf, currentSession, sendView } from "./shared.mjs";
import { openSessions, showMain } from "./sessions.mjs";

export async function openReport(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  if (!chat.activeSession) {
    await ctx.tg.send(chatId, "Сначала выбери сессию.");
    return openSessions(ctx, chatId, 0, editId);
  }
  return openReportFor(ctx, chatId, chat.activeSession, editId);
}

export async function openReportFor(ctx, chatId, sessionId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc || !sessionId) return;
  try {
    const session = await oc.session(sessionId);
    const cwd = session.location?.directory || ctx.config.defaultDirectory;
    const [messages, info] = await Promise.all([
      oc.messages(sessionId, 50, "desc"),
      repoInfo(ctx.config, cwd),
    ]);
    await sendView(ctx, chatId, reportView({ session, messages, gitInfo: info, cwd }), editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}

export async function openSessionById(ctx, chatId, sessionId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc || !sessionId) return;
  const chat = chatOf(ctx, chatId);
  chat.activeSession = sessionId;
  chat.gitCwd = null;
  chat.menu = null;
  ctx.store.save();
  await showMain(ctx, chatId, editId);
}

export async function openStatus(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const [session, activeMap, stats] = await Promise.all([
    currentSession(ctx, chat).catch(() => null),
    oc.active().catch(() => ({})),
    oc.stats().catch(() => null),
  ]);
  let freeGb = "?";
  try {
    const fs = statfsSync("G:\\");
    freeGb = `${((fs.bavail * fs.bsize) / 1024 ** 3).toFixed(1)} ГБ`;
  } catch {}
  await sendView(
    ctx,
    chatId,
    statusView({ service: { url: oc.url, info: oc.info }, session, activeMap, stats, freeGb }),
    editId,
  );
}

export async function openService(ctx, chatId, editId) {
  const items = await ctx.service.all();
  const chat = chatOf(ctx, chatId);
  chat.menu = { kind: "service", items };
  ctx.store.save();
  await sendView(ctx, chatId, serviceView({ items, selected: ctx.store.data.servicePath }), editId);
}

export async function selectService(ctx, chatId, index, editId) {
  const chat = chatOf(ctx, chatId);
  const item = chat.menu?.items?.[index];
  if (!item) return openService(ctx, chatId, editId);
  if (!item.ok) {
    await ctx.tg.send(chatId, `Сервис недоступен: <code>${esc(item.path)}</code>`);
    return;
  }
  ctx.service.select(item.path);
  await ctx.tg.send(chatId, `🖥 Подключено: <code>${esc(item.url)}</code>`);
  await showMain(ctx, chatId, editId);
}

export async function showHelp(ctx, chatId, editId) {
  await sendView(ctx, chatId, helpView(), editId);
}

export async function askDelete(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  if (!chat.activeSession) return showMain(ctx, chatId, editId);
  const session = await oc.session(chat.activeSession).catch(() => null);
  if (session) await sendView(ctx, chatId, confirmDelete({ session }), editId);
}

export async function deleteSession(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  if (!chat.activeSession) return showMain(ctx, chatId, editId);
  try {
    await oc.remove(chat.activeSession);
    chat.activeSession = null;
    ctx.store.save();
    await ctx.tg.send(chatId, "🗑 Сессия удалена.");
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
  await showMain(ctx, chatId, editId);
}
