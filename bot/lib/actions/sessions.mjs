import { mainView, sessionsView } from "../ui.mjs";
import { PAGE, client, chatOf, currentSession, sendView } from "./shared.mjs";

export async function showMain(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const session = await currentSession(ctx, chat).catch(() => null);
  const [activeMap, stats] = await Promise.all([
    oc.active().catch(() => ({})),
    oc.stats().catch(() => null),
  ]);
  const view = mainView({
    botName: ctx.config.botName,
    service: { url: oc.url, info: oc.info },
    session,
    activeMap,
    running: chat.running,
  });
  await sendView(ctx, chatId, view, editId);
}

export async function openSessions(ctx, chatId, page = 0, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const [all, activeMap] = await Promise.all([oc.sessions(50), oc.active().catch(() => ({}))]);
  const pages = Math.max(1, Math.ceil(all.length / PAGE));
  const safePage = Math.min(Math.max(0, page), pages - 1);
  const items = all.slice(safePage * PAGE, safePage * PAGE + PAGE);
  chat.menu = { kind: "sessions", sessions: all, page: safePage, items };
  ctx.store.save();
  await sendView(ctx, chatId, sessionsView({ items, page: safePage, activeId: chat.activeSession, activeMap }), editId);
}

export async function pickSession(ctx, chatId, index, editId) {
  const chat = chatOf(ctx, chatId);
  const session = chat.menu?.items?.[index];
  if (!session) return openSessions(ctx, chatId, 0, editId);
  chat.activeSession = session.id;
  chat.gitCwd = null;
  chat.menu = null;
  ctx.store.save();
  await showMain(ctx, chatId, editId);
}

export async function takePcSession(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const activeMap = await oc.active().catch(() => ({}));
  const id = Object.keys(activeMap)[0];
  if (!id) {
    await ctx.tg.send(chatId, "На ПК сейчас нет активной сессии.");
    return openSessions(ctx, chatId, 0, editId);
  }
  const chat = chatOf(ctx, chatId);
  chat.activeSession = id;
  chat.gitCwd = null;
  ctx.store.save();
  await showMain(ctx, chatId, editId);
}
