import { esc } from "../format.mjs";
import { friendlyError } from "../opencode.mjs";

export const PAGE = 8;

export async function sendView(ctx, chatId, view, editId) {
  if (editId) await ctx.tg.edit(chatId, editId, view.text, view.keyboard);
  else await ctx.tg.send(chatId, view.text, view.keyboard);
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
