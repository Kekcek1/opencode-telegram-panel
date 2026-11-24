import { confirmDeleteSession, renamePrompt, sessionDetailView } from "../ui.mjs";
import { esc } from "../format.mjs";
import { removeSession } from "../groups.mjs";
import { friendlyError } from "../opencode.mjs";
import { client, chatOf, sendView } from "./shared.mjs";
import { openSessions, renderSessionList, sessionGroups } from "./sessions.mjs";
import { showMain } from "./sessions.mjs";

export async function openSessionDetail(ctx, chatId, index, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const session = chat.menu?.items?.[index];
  if (!session) return renderSessionList(ctx, chatId, chat.menu?.page ?? 0, editId);
  const [fresh, activeMap] = await Promise.all([
    oc.session(session.id).catch(() => session),
    oc.active().catch(() => ({})),
  ]);
  chat.detail = { id: session.id, index, page: chat.menu.page ?? 0 };
  ctx.store.save();
  await sendView(
    ctx,
    chatId,
    sessionDetailView({
      session: fresh,
      group: sessionGroups(oc, session.id),
      active: chat.activeSession === session.id,
      running: Boolean(activeMap[session.id]),
    }),
    editId,
  );
}

export async function pickDetail(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  const id = chat.detail?.id;
  if (!id) return openSessions(ctx, chatId, 0, editId);
  chat.activeSession = id;
  chat.gitCwd = null;
  chat.detail = null;
  chat.menu = null;
  ctx.store.save();
  await showMain(ctx, chatId, editId);
}

export async function askDeleteSession(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  const id = chat.detail?.id;
  const session = chat.menu?.items?.find((item) => item.id === id);
  if (!session) return openSessions(ctx, chatId, 0, editId);
  chat.deleteTarget = id;
  ctx.store.save();
  await sendView(ctx, chatId, confirmDeleteSession({ session }), editId);
}

export async function deleteSessionConfirmed(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const id = chat.deleteTarget;
  if (!id) return openSessions(ctx, chatId, 0, editId);
  try {
    await oc.remove(id);
    try {
      removeSession(oc, id);
    } catch (error) {
      ctx.log?.(`groups cleanup failed: ${error?.message || error}`);
    }
    if (chat.activeSession === id) chat.activeSession = null;
    chat.deleteTarget = null;
    chat.detail = null;
    chat.menu = null;
    ctx.store.save();
    await ctx.tg.send(chatId, "🗑 Сессия удалена.");
    await openSessions(ctx, chatId, 0, editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}

export async function startSessionRename(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  const session = chat.menu?.items?.find((item) => item.id === chat.detail?.id);
  if (!session) return openSessions(ctx, chatId, 0, editId);
  chat.mode = "session-rename";
  chat.renameTarget = session.id;
  ctx.store.save();
  await sendView(ctx, chatId, renamePrompt({ kind: "session", current: session.title ?? session.id }), editId);
}

export async function finishSessionRename(ctx, chatId, text, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  try {
    await oc.rename(chat.renameTarget, text.trim());
    chat.mode = null;
    chat.renameTarget = null;
    ctx.store.save();
    await ctx.tg.send(chatId, `✏️ Сессия переименована: <b>${esc(text.trim())}</b>`);
    await openSessionDetail(ctx, chatId, chat.detail?.index ?? 0, editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}

export async function backToSessions(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  chat.detail = null;
  chat.groupPicker = null;
  ctx.store.save();
  if (chat.menu?.kind === "group") return renderSessionList(ctx, chatId, chat.menu.page ?? 0, editId);
  return openSessions(ctx, chatId, 0, editId);
}
