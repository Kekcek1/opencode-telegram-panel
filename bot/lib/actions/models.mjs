import { agentsView, modelsView, providersView } from "../ui.mjs";
import { esc } from "../format.mjs";
import { PAGE, client, chatOf, sendView } from "./shared.mjs";
import { openSessions, showMain } from "./sessions.mjs";

export async function openModel(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  if (!chat.activeSession) {
    await ctx.tg.send(chatId, "Сначала выбери сессию.");
    return openSessions(ctx, chatId, 0, editId);
  }
  const models = await oc.models();
  const providers = await oc.providers().catch(() => []);
  const names = Object.fromEntries(providers.map((p) => [p.id, p.name]));
  const counts = {};
  for (const model of models) counts[model.providerID] = (counts[model.providerID] || 0) + 1;
  const items = Object.keys(counts).map((id) => ({ id, name: names[id] || id, count: counts[id] })).sort((a, b) => b.count - a.count);
  chat.menu = { kind: "providers", source: "set", providers: items, models };
  ctx.store.save();
  await sendView(ctx, chatId, providersView({ items, prefix: "mp", title: "Модель сессии" }), editId);
}

export async function openModelSearch(ctx, chatId, query, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  if (!chat.activeSession) {
    await ctx.tg.send(chatId, "Сначала выбери сессию.");
    return openSessions(ctx, chatId, 0, editId);
  }
  const needle = query.toLowerCase();
  const found = (await oc.models()).filter(
    (model) => model.id.toLowerCase().includes(needle) || String(model.name || "").toLowerCase().includes(needle),
  );
  if (!found.length) {
    await ctx.tg.send(chatId, `Модели по запросу «${esc(query)}» не найдены.`);
    return;
  }
  chat.menu = {
    kind: "models",
    source: "set",
    provider: "search",
    title: `Поиск: ${query}`,
    subtitle: `${found.length} моделей`,
    prefix: "mm",
    models: found,
    page: 0,
  };
  ctx.store.save();
  await renderModelsPage(ctx, chatId, 0, editId);
}

export async function openAgents(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  if (!chat.activeSession) {
    await ctx.tg.send(chatId, "Сначала выбери сессию.");
    return openSessions(ctx, chatId, 0, editId);
  }
  const agents = (await oc.agents()).filter((agent) => !agent.hidden && ["primary", "all"].includes(agent.mode));
  chat.menu = { kind: "agents", source: "set", agents };
  ctx.store.save();
  await sendView(ctx, chatId, agentsView({ items: agents, prefix: "ma", title: "Агент / план" }), editId);
}

export async function pickSetAgent(ctx, chatId, index, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const agent = chat.menu?.agents?.[index];
  if (!agent || !chat.activeSession) return showMain(ctx, chatId, editId);
  try {
    await oc.setAgent(chat.activeSession, agent.id);
    chat.menu = null;
    ctx.store.save();
    await ctx.tg.send(chatId, `🎛 Агент: <code>${esc(agent.id)}</code>`);
    await showMain(ctx, chatId, editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}
