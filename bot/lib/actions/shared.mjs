import { esc } from "../format.mjs";
import { friendlyError } from "../opencode.mjs";

export const PAGE = 8;

export async function sendView(ctx, chatId, view, editId, options = {}) {
  const chat = chatOf(ctx, chatId);
  const nav = options.nav !== false;
  if (editId) {
    if (nav && chat.navMessageId && chat.navMessageId !== editId) {
      await ctx.tg.delete(chatId, chat.navMessageId);
    }
    const id = await ctx.tg.edit(chatId, editId, view.text, view.keyboard);
    if (nav) {
      chat.navMessageId = id ?? editId;
      ctx.store.save();
    }
    return id;
  }
  if (nav && chat.navMessageId) {
    await ctx.tg.delete(chatId, chat.navMessageId);
    chat.navMessageId = null;
  }
  const id = await ctx.tg.send(chatId, view.text, view.keyboard);
  if (nav) {
    chat.navMessageId = id;
  }
  ctx.store.save();
  return id;
}

export async function sendReport(ctx, chatId, view) {
  const chat = chatOf(ctx, chatId);
  if (chat.reportMessageId) await ctx.tg.delete(chatId, chat.reportMessageId);
  chat.reportMessageId = await ctx.tg.send(chatId, view.text, view.keyboard);
  ctx.store.save();
  return chat.reportMessageId;
}

export async function client(ctx, chatId) {
  try {
    return await ctx.service.client();
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
    return null;
  }
}

export function chatOf(ctx, chatId) {
  return ctx.store.chat(chatId);
}

export async function currentSession(ctx, chat) {
  if (!chat.activeSession) return null;
  const oc = await ctx.service.client();
  try {
    return await oc.session(chat.activeSession);
  } catch {
    chat.activeSession = null;
    ctx.store.save();
    return null;
  }
}
