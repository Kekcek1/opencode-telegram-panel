import { confirmDeleteGroup, groupPickerView, groupsView } from "../ui.mjs";
import { esc } from "../format.mjs";
import {
  assignGroup,
  createGroup,
  deleteGroup,
  groupCounts,
  groupNames,
  readFolders,
  renameGroup,
  ungroupedSessions,
} from "../groups.mjs";
import { friendlyError } from "../opencode.mjs";
import { client, chatOf, sendView } from "./shared.mjs";
import { openSessions, renderSessionList, sessionGroups } from "./sessions.mjs";
import { openSessionDetail } from "./session-detail.mjs";

export async function openGroups(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const [sessions, activeMap] = await Promise.all([oc.sessions(100), oc.active().catch(() => ({}))]);
  const data = readFolders(oc);
  chat.menu = { kind: "groups", groups: groupCounts(data), sessions, activeMap, page: 0 };
  ctx.store.save();
  await sendView(
    ctx,
    chatId,
    groupsView({
      items: chat.menu.groups,
      ungrouped: ungroupedSessions(oc, sessions).length,
      total: sessions.length,
    }),
    editId,
  );
}

export async function openGroup(ctx, chatId, index, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const data = readFolders(oc);
  const all = await oc.sessions(100);
  const activeMap = await oc.active().catch(() => ({}));
  const named = String(index) !== "none";
  const group = named ? chat.menu?.groups?.[Number(index)]?.name ?? groupNames(data)[Number(index)] : null;
  if (named && !group) return openGroups(ctx, chatId, editId);
  const ids = group ? data.sessions[group] ?? [] : ungroupedSessions(oc, all).map((session) => session.id);
  const items = ids.map((id) => all.find((session) => session.id === id)).filter(Boolean);
  const groups = {};
  for (const name of data.order) for (const id of data.sessions[name] ?? []) groups[id] = name;
  chat.groupIndex = named ? Number(index) : "none";
  chat.menu = {
    kind: "group",
    group,
    sessions: items,
    page: 0,
    title: group ? `📁 ${group}` : "🚫 Без группы",
    pagePrefix: "gpg",
    back: "groups",
    activeMap,
    groups,
    extraRows: group
      ? [[{ text: "✏️ Переименовать", callback_data: "gren" }, { text: "🗑 Удалить группу", callback_data: "gdelask" }]]
      : [],
  };
  ctx.store.save();
  await renderSessionList(ctx, chatId, 0, editId);
}

export async function openGroupPicker(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const id = chat.detail?.id;
  if (!id) return openSessions(ctx, chatId, 0, editId);
  const data = readFolders(oc);
  const session = chat.menu?.items?.find((item) => item.id === id) ?? (await oc.session(id));
  chat.groupPicker = { id, groups: groupNames(data) };
  ctx.store.save();
  await sendView(ctx, chatId, groupPickerView({ groups: chat.groupPicker.groups, current: sessionGroups(oc, id), session }), editId);
}

export async function assignPickedGroup(ctx, chatId, index, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const name = chat.groupPicker?.groups?.[index];
  if (!name || !chat.groupPicker?.id) return openGroupPicker(ctx, chatId, editId);
  try {
    assignGroup(oc, chat.groupPicker.id, name);
    await ctx.tg.send(chatId, `📁 Сессия в группе «${esc(name)}».`);
    chat.groupPicker = null;
    ctx.store.save();
    await openSessionDetail(ctx, chatId, chat.detail?.index ?? 0, editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}

export async function clearSessionGroup(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  if (!chat.groupPicker?.id) return openGroupPicker(ctx, chatId, editId);
  try {
    assignGroup(oc, chat.groupPicker.id, null);
    await ctx.tg.send(chatId, "🚫 Сессия убрана из группы.");
    chat.groupPicker = null;
    ctx.store.save();
    await openSessionDetail(ctx, chatId, chat.detail?.index ?? 0, editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}

export async function startGroupForSession(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  if (!chat.detail?.id) return openSessions(ctx, chatId, 0, editId);
  chat.mode = "group-new";
  chat.groupSession = chat.detail.id;
  ctx.store.save();
  await sendView(ctx, chatId, { text: "<b>📁 Новая группа</b>\nОтправь название группы.", keyboard: { inline_keyboard: [[{ text: "✖️ Отмена", callback_data: "sback" }]] } }, editId);
}

export async function startGroup(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  chat.mode = "group-create";
  chat.groupSession = null;
  chat.detail = null;
  ctx.store.save();
  await sendView(ctx, chatId, { text: "<b>📁 Новая группа</b>\nОтправь название группы.", keyboard: { inline_keyboard: [[{ text: "✖️ Отмена", callback_data: "gback" }]] } }, editId);
}

export async function finishGroupName(ctx, chatId, text, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  try {
    const name = text.trim();
    createGroup(oc, name);
    if (chat.groupSession) assignGroup(oc, chat.groupSession, name);
    chat.mode = null;
    chat.groupSession = null;
    ctx.store.save();
    await ctx.tg.send(chatId, `📁 Группа «${esc(name)}» готова.`);
    if (chat.detail?.id) return openSessionDetail(ctx, chatId, chat.detail.index ?? 0, editId);
    return openGroups(ctx, chatId, editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}

export async function startRenameGroup(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  const name = chat.menu?.group;
  if (!name) return openGroups(ctx, chatId, editId);
  chat.mode = "group-rename";
  chat.groupTarget = name;
  ctx.store.save();
  await sendView(ctx, chatId, renamePrompt({ kind: "group", current: name }), editId);
}

export async function finishGroupRename(ctx, chatId, text, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  try {
    renameGroup(oc, chat.groupTarget, text.trim());
    chat.mode = null;
    chat.groupTarget = null;
    ctx.store.save();
    await openGroups(ctx, chatId, editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}

export async function askDeleteGroup(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  const name = chat.menu?.group;
  if (!name) return openGroups(ctx, chatId, editId);
  chat.deleteGroup = name;
  ctx.store.save();
  await sendView(ctx, chatId, confirmDeleteGroup({ name, count: chat.menu.sessions?.length ?? 0 }), editId);
}

export async function deleteGroupConfirmed(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  try {
    deleteGroup(oc, chat.deleteGroup);
    chat.deleteGroup = null;
    ctx.store.save();
    await openGroups(ctx, chatId, editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}

export async function backToGroup(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  const index = chat.groupIndex;
  if (index === undefined) return openGroups(ctx, chatId, editId);
  return openGroup(ctx, chatId, index, editId);
}
