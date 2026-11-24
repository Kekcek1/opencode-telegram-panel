import {
  agentsView,
  connectionPickerView,
  favoritesView,
  hiddenView,
  modelHomeView,
  modelsView,
  noteView,
  providersView,
} from "../ui.mjs";
import { esc } from "../format.mjs";
import { friendlyError } from "../opencode.mjs";
import {
  decorate,
  favoriteCount,
  favoriteModels,
  modelKey,
  setNote,
  toggleFavorite,
  toggleHidden,
  visible,
} from "../prefs.mjs";
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
  const availableFavorites = favoriteModels(ctx.store, models).length;
  chat.menu = { kind: "model-home", models, credentials };
  ctx.store.save();
  await sendView(
    ctx,
    chatId,
    modelHomeView({
      activeConnection: active,
      favoriteCount: favoriteCount(ctx.store),
      favoriteAvailable: availableFavorites,
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
  const models = chat.menu?.kind === "model-home" ? chat.menu.models : decorate(ctx.store, await oc.models());
  const allowed = models
    .filter((model) => !model.hidden)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));
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
  const models = chat.menu?.kind === "model-home" ? chat.menu.models : decorate(ctx.store, await oc.models());
  const favorites = favoriteModels(ctx.store, models);
  if (!favorites.length) {
    const message = favoriteCount(ctx.store)
      ? "Избранные модели скрыты или недоступны на этом ключе. Проверь 🙈 Скрытые или смени коннект."
      : "В избранном пока пусто. Открой «Все модели» и нажми ☆.";
    await ctx.tg.send(chatId, message);
    return openModel(ctx, chatId, editId);
  }
  chat.menu = {
    kind: "favorites",
    models: favorites,
    page: 0,
  };
  ctx.store.save();
  await renderFavoritesPage(ctx, chatId, 0, editId);
}

export async function renderFavoritesPage(ctx, chatId, page, editId) {
  const chat = chatOf(ctx, chatId);
  const menu = chat.menu;
  if (!menu || menu.kind !== "favorites") return openModelFavorites(ctx, chatId, editId);
  const visibleModels = menu.models.filter((model) => !model.hidden);
  const pages = Math.max(1, Math.ceil(visibleModels.length / PAGE));
  const safe = Math.min(Math.max(0, page), pages - 1);
  const items = visibleModels.slice(safe * PAGE, safe * PAGE + PAGE);
  menu.page = safe;
  menu.items = items;
  ctx.store.save();
  await sendView(ctx, chatId, favoritesView({ items, page: safe }), editId);
}

export async function openNoteEditor(ctx, chatId, index, editId) {
  const chat = chatOf(ctx, chatId);
  const model = chat.menu?.items?.[index] ?? chat.menu?.models?.[index];
  if (!model) return openModelFavorites(ctx, chatId, editId);
  const target = { ...model, index };
  chat.mode = "favorite-note";
  chat.noteModel = {
    providerID: model.providerID,
    id: model.id,
    name: model.name,
    note: model.note,
  };
  ctx.store.save();
  await sendView(ctx, chatId, noteView({ model: target }), editId);
}

export async function saveFavoriteNote(ctx, chatId, text) {
  const chat = chatOf(ctx, chatId);
  const model = chat.noteModel;
  if (!model) {
    chat.mode = null;
    ctx.store.save();
    return openModelFavorites(ctx, chatId);
  }
  const note = text.trim() === "-" ? "" : text.trim();
  setNote(ctx.store, model, note);
  chat.mode = null;
  chat.noteModel = null;
  ctx.store.save();
  await ctx.tg.send(chatId, note ? "📝 Заметка сохранена." : "📝 Заметка очищена.");
  return openModelFavorites(ctx, chatId);
}

export async function clearFavoriteNote(ctx, chatId, index, editId) {
  const chat = chatOf(ctx, chatId);
  const model = chat.menu?.items?.[index] ?? chat.menu?.models?.[index];
  if (!model) return openModelFavorites(ctx, chatId, editId);
  setNote(ctx.store, model, "");
  return renderFavoritesPage(ctx, chatId, chat.menu.page ?? 0, editId);
}

export async function removeFavoriteModel(ctx, chatId, index, editId) {
  const chat = chatOf(ctx, chatId);
  const model = chat.menu?.items?.[index] ?? chat.menu?.models?.[index];
  if (!model) return openModelFavorites(ctx, chatId, editId);
  if (model.favorite) toggleFavorite(ctx.store, model);
  chat.menu = { ...chat.menu, models: (chat.menu.models ?? []).filter((item) => modelKey(item) !== modelKey(model)) };
  if (!chat.menu.models.length) {
    await ctx.tg.send(chatId, "Избранное пусто.");
    return openModel(ctx, chatId, editId);
  }
  return renderFavoritesPage(ctx, chatId, Math.min(chat.menu.page ?? 0, Math.ceil(chat.menu.models.length / PAGE) - 1), editId);
}

export async function openHidden(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const models = chat.menu?.kind === "model-home" ? chat.menu.models : decorate(ctx.store, await oc.models());
  chat.menu = { kind: "hidden", models, page: 0 };
  ctx.store.save();
  await renderHiddenPage(ctx, chatId, 0, editId);
}

export async function renderHiddenPage(ctx, chatId, page, editId) {
  const chat = chatOf(ctx, chatId);
  const menu = chat.menu;
  if (!menu || menu.kind !== "hidden") return openHidden(ctx, chatId, editId);
  const hidden = menu.models.filter((model) => model.hidden);
  const pages = Math.max(1, Math.ceil(hidden.length / PAGE));
  const safe = Math.min(Math.max(0, page), pages - 1);
  const items = hidden.slice(safe * PAGE, safe * PAGE + PAGE);
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
  if (chat.menu.kind === "favorites") return renderFavoritesPage(ctx, chatId, chat.menu.page ?? 0, editId);
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
  if (chat.menu.kind === "favorites") return renderFavoritesPage(ctx, chatId, chat.menu.page ?? 0, editId);
  if (chat.menu.kind === "models") return renderModelsPage(ctx, chatId, chat.menu.page ?? 0, editId);
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

export async function renderModelsPage(ctx, chatId, page, editId) {
  const chat = chatOf(ctx, chatId);
  const menu = chat.menu;
  if (!menu || menu.kind !== "models") return showMain(ctx, chatId, editId);
  const visibleModels = menu.models.filter((model) => !model.hidden);
  const pages = Math.max(1, Math.ceil(visibleModels.length / PAGE));
  const safe = Math.min(Math.max(0, page), pages - 1);
  const items = visibleModels.slice(safe * PAGE, safe * PAGE + PAGE);
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
