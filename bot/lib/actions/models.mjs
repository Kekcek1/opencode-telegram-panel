import { agentsView, connectionPickerView, hiddenView, modelHomeView, modelsView, providersView } from "../ui.mjs";
import { esc } from "../format.mjs";
import { friendlyError } from "../opencode.mjs";
import { decorate, favoriteModels, toggleFavorite, toggleHidden, visible } from "../prefs.mjs";
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
  const models = decorate(ctx.store, await oc.models());
  const credentials = await oc.credentials().catch(() => []);
  const active = credentials.find((item) => item.integrationID === "commandcode" && item.active) ?? null;
  chat.menu = { kind: "model-home", models, credentials };
  ctx.store.save();
  await sendView(
    ctx,
    chatId,
    modelHomeView({
      activeConnection: active,
      favoriteCount: favoriteModels(ctx.store, models).length,
      hiddenCount: models.filter((model) => model.hidden).length,
      visibleCount: visible(ctx.store, models).length,
      totalCount: models.length,
    }),
    editId,
  );
}

export async function openModelAll(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const models = chat.menu?.models ?? decorate(ctx.store, await oc.models());
  const allowed = models.filter((model) => !model.hidden);
  const providers = await oc.providers().catch(() => []);
  const names = Object.fromEntries(providers.map((provider) => [provider.id, provider.name]));
  const counts = {};
  for (const model of allowed) counts[model.providerID] = (counts[model.providerID] || 0) + 1;
  const items = Object.keys(counts)
    .map((id) => ({ id, name: names[id] || id, count: counts[id] }))
    .sort((a, b) => b.count - a.count);
  chat.menu = { kind: "providers", source: "set", providers: items, models };
  ctx.store.save();
  await sendView(ctx, chatId, providersView({ items, prefix: "mp", title: "Все модели" }), editId);
}

export async function openModelFavorites(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const models = chat.menu?.models ?? decorate(ctx.store, await oc.models());
  const favorites = favoriteModels(ctx.store, models);
  if (!favorites.length) {
    await ctx.tg.send(chatId, "В избранном пока пусто. Открой «Все модели» и нажми ☆.");
    return openModel(ctx, chatId, editId);
  }
  chat.menu = {
    kind: "models",
    source: "set",
    title: "⭐ Избранное",
    subtitle: `${favorites.length} моделей · общее для всех ключей`,
    prefix: "mm",
    models: favorites,
    page: 0,
    back: "model",
  };
  ctx.store.save();
  await renderModelsPage(ctx, chatId, 0, editId);
}

export async function openHidden(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  chat.menu = { kind: "hidden", models: chat.menu?.models ?? decorate(ctx.store, await oc.models()), page: 0 };
  ctx.store.save();
  await renderHiddenPage(ctx, chatId, 0, editId);
}

export async function renderHiddenPage(ctx, chatId, page, editId) {
  const chat = chatOf(ctx, chatId);
  const menu = chat.menu;
  if (!menu || menu.kind !== "hidden") return openHidden(ctx, chatId, editId);
  const pages = Math.max(1, Math.ceil(menu.models.length / PAGE));
  const safe = Math.min(Math.max(0, page), pages - 1);
  const items = menu.models.slice(safe * PAGE, safe * PAGE + PAGE);
  menu.page = safe;
  menu.items = items;
  ctx.store.save();
  await sendView(ctx, chatId, hiddenView({ items, page: safe }), editId);
}

export async function toggleFavoriteModel(ctx, chatId, index, editId) {
  const chat = chatOf(ctx, chatId);
  const model = chat.menu?.items?.[index] ?? chat.menu?.models?.[index];
  if (!model) return;
  model.favorite = toggleFavorite(ctx.store, model);
  ctx.store.save();
  if (chat.menu.kind === "hidden") return renderHiddenPage(ctx, chatId, chat.menu.page ?? 0, editId);
  if (chat.menu.kind === "models") return renderModelsPage(ctx, chatId, chat.menu.page ?? 0, editId);
  return openModel(ctx, chatId, editId);
}

export async function toggleHiddenModel(ctx, chatId, index, editId) {
  const chat = chatOf(ctx, chatId);
  const model = chat.menu?.items?.[index];
  if (!model) return;
  model.hidden = toggleHidden(ctx.store, model);
  ctx.store.save();
  if (chat.menu.kind === "hidden") return renderHiddenPage(ctx, chatId, chat.menu.page ?? 0, editId);
  return openModel(ctx, chatId, editId);
}

export async function openConnectionPicker(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const credentials = (await oc.credentials()).filter((item) => item.integrationID === "commandcode");
  chat.menu = { kind: "connection-picker", credentials };
  ctx.store.save();
  await sendView(ctx, chatId, connectionPickerView({ items: credentials }), editId);
}

export async function selectConnection(ctx, chatId, index, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const credential = chat.menu?.credentials?.[index];
  if (!credential) return openConnectionPicker(ctx, chatId, editId);
  try {
    await oc.activateCredential(credential.id);
    await ctx.tg.send(chatId, `🔑 Активен: <b>${esc(credential.label)}</b>`);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
  await openModel(ctx, chatId, editId);
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

export async function renderModelsPage(ctx, chatId, page, editId) {
  const chat = chatOf(ctx, chatId);
  const menu = chat.menu;
  if (!menu || menu.kind !== "models") return showMain(ctx, chatId, editId);
  const pages = Math.max(1, Math.ceil(menu.models.length / PAGE));
  const safe = Math.min(Math.max(0, page), pages - 1);
  const items = menu.models.slice(safe * PAGE, safe * PAGE + PAGE);
  menu.page = safe;
  menu.items = items;
  ctx.store.save();
  await sendView(
    ctx,
    chatId,
    modelsView({ items, page: safe, prefix: menu.prefix, title: menu.title, subtitle: menu.subtitle, back: menu.back ?? "model" }),
    editId,
  );
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
