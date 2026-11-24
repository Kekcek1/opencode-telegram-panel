import { mainView, sessionsView } from "../ui.mjs";
import { groupOf, readFolders } from "../groups.mjs";
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

function groupMap(oc) {
  const data = readFolders(oc);
  const map = {};
  for (const name of data.order) {
    for (const id of data.sessions[name] ?? []) map[id] = name;
  }
  return map;
}

export async function openSessions(ctx, chatId, page = 0, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const [all, activeMap] = await Promise.all([oc.sessions(100), oc.active().catch(() => ({}))]);
  chat.menu = {
    kind: "sessions",
    sessions: all,
    page: 0,
    title: "📋 Сессии",
    pagePrefix: "slist",
    back: "home",
    activeMap,
    groups: groupMap(oc),
  };
  ctx.store.save();
  await renderSessionList(ctx, chatId, page, editId);
}

export async function renderSessionList(ctx, chatId, page = 0, editId) {
  const chat = chatOf(ctx, chatId);
  const menu = chat.menu;
  if (!menu || !["sessions", "group"].includes(menu.kind)) return openSessions(ctx, chatId, page, editId);
  const pages = Math.max(1, Math.ceil(menu.sessions.length / PAGE));
  const safe = Math.min(Math.max(0, page), pages - 1);
  const items = menu.sessions.slice(safe * PAGE, safe * PAGE + PAGE);
  menu.page = safe;
  menu.items = items;
  ctx.store.save();
  await sendView(
    ctx,
    chatId,
    sessionsView({
      items,
      page: safe,
      activeId: chat.activeSession,
      activeMap: menu.activeMap ?? {},
      title: menu.title,
      groups: menu.groups ?? {},
      group: menu.kind === "group" ? menu.group : null,
      pagePrefix: menu.pagePrefix,
      back: menu.back,
      extraRows: menu.extraRows ?? [],
    }),
    editId,
  );
}

export async function pickSession(ctx, chatId, index, editId) {
  const chat = chatOf(ctx, chatId);
  const session = chat.menu?.items?.[index];
  if (!session) return openSessions(ctx, chatId, 0, editId);
  chat.activeSession = session.id;
  chat.gitCwd = null;
  chat.menu = null;
  chat.detail = null;
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

export function sessionGroups(oc, sessionId) {
  return groupOf(readFolders(oc), sessionId);
}
