import { esc } from "../format.mjs";
import { visible } from "../prefs.mjs";
import { client, chatOf } from "./shared.mjs";
import { openSessions } from "./sessions.mjs";
import { renderModelsPage } from "./models.mjs";

export async function openModelSearch(ctx, chatId, query, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  if (!chat.activeSession) {
    await ctx.tg.send(chatId, "Сначала выбери сессию.");
    return openSessions(ctx, chatId, 0, editId);
  }
  const needle = query.toLowerCase();
  const found = visible(ctx.store, await oc.models())
    .filter((model) => model.id.toLowerCase().includes(needle) || String(model.name || "").toLowerCase().includes(needle))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  if (!found.length) {
    await ctx.tg.send(chatId, `Модели по запросу «${esc(query)}» не найдены.`);
    return;
  }
  chat.menu = {
    kind: "models",
    source: "set",
    provider: "search",
    title: `Поиск: ${query}`,
    subtitle: `${found.length} моделей · ⭐ сверху`,
    prefix: "mm",
    models: found,
    page: 0,
    back: "model",
  };
  ctx.store.save();
  await renderModelsPage(ctx, chatId, 0, editId);
}
