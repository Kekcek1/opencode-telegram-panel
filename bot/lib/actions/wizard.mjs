import { agentsView, dirsView, modelsView, providersView, variantsView } from "../ui.mjs";
import { esc, fmtDate, modelTitle, sessionTitle } from "../format.mjs";
import { friendlyError } from "../opencode.mjs";
import { decorate, modelRef, visible } from "../prefs.mjs";
import { PAGE, client, chatOf, sendView } from "./shared.mjs";
import { showMain } from "./sessions.mjs";

export async function openNew(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const sessions = await oc.sessions(30).catch(() => []);
  const dirs = [
    ...new Set([
      ...sessions.map((s) => s.location?.directory).filter(Boolean),
      ctx.config.defaultDirectory,
      "G:\\",
      "C:\\Users\\utubk",
    ]),
  ].slice(0, 12);
  chat.wizard = { directory: null, model: null, agent: null };
  chat.menu = { kind: "dirs", dirs };
  ctx.store.save();
  await sendView(ctx, chatId, dirsView({ items: dirs }), editId);
}

export async function pickDir(ctx, chatId, index, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const directory = chat.menu?.dirs?.[index];
  if (!directory) return openNew(ctx, chatId, editId);
  chat.wizard ??= {};
  chat.wizard.directory = directory;
  const models = decorate(ctx.store, await oc.models());
  const providers = await oc.providers().catch(() => []);
  const names = Object.fromEntries(providers.map((p) => [p.id, p.name]));
  const counts = {};
  for (const model of visible(ctx.store, models)) counts[model.providerID] = (counts[model.providerID] || 0) + 1;
  const items = Object.keys(counts)
    .map((id) => ({ id, name: names[id] || id, count: counts[id] }))
    .sort((a, b) => b.count - a.count);
  chat.menu = { kind: "providers", source: "new", providers: items, models };
  ctx.store.save();
  await sendView(ctx, chatId, providersView({ items, prefix: "np", title: "Шаг 2/3. Провайдер" }), editId);
}

export async function pickProvider(ctx, chatId, index, editId, source = "new") {
  const chat = chatOf(ctx, chatId);
  const item = chat.menu?.providers?.[index];
  if (!item) return showMain(ctx, chatId, editId);
  const models = (chat.menu.models || [])
    .filter((model) => model.providerID === item.id && !model.hidden)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite));
  chat.menu = {
    kind: "models",
    source,
    provider: item.id,
    title: source === "new" ? "Шаг 2/3. Модель" : "Модель сессии",
    subtitle: `${item.name} · ${models.length} · ⭐ сверху`,
    prefix: source === "new" ? "nm" : "mm",
    models,
    page: 0,
    back: source === "new" ? "home" : "model",
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
    modelsView({ items, page: safe, prefix: menu.prefix, title: menu.title, subtitle: menu.subtitle, back: menu.back ?? "home" }),
    editId,
  );
}

export async function pickModel(ctx, chatId, index, editId, source = "new") {
  const chat = chatOf(ctx, chatId);
  const model = chat.menu?.items?.[index];
  if (!model) return showMain(ctx, chatId, editId);
  const variants = (model.variants || []).map((variant) => variant.id).filter(Boolean);
  if (variants.length) {
    chat.menu = { kind: "variants", source, model, variants };
    ctx.store.save();
    await sendView(
      ctx,
      chatId,
      variantsView({ items: variants, prefix: source === "new" ? "nv" : "mv", model }),
      editId,
    );
    return;
  }
  await applyModelChoice(ctx, chatId, { ...model, variant: undefined }, source, editId);
}

export async function pickVariant(ctx, chatId, index, editId, source = "new") {
  const chat = chatOf(ctx, chatId);
  const menu = chat.menu;
  const variant = menu?.variants?.[index];
  if (!variant) return showMain(ctx, chatId, editId);
  const model = { ...menu.model, variant };
  await applyModelChoice(ctx, chatId, model, source, editId);
}

async function applyModelChoice(ctx, chatId, model, source, editId) {
  const chat = chatOf(ctx, chatId);
  if (source === "new") {
    chat.wizard.model = modelRef(model);
    await openNewAgents(ctx, chatId, editId);
    return;
  }
  const oc = await client(ctx, chatId);
  if (!oc || !chat.activeSession) return;
  try {
    await oc.setModel(chat.activeSession, modelRef(model));
    chat.menu = null;
    ctx.store.save();
    await ctx.tg.send(chatId, `🧠 Модель: <code>${esc(modelTitle(model))}</code>${model.variant ? ` · ${esc(model.variant)}` : ""}`);
    await showMain(ctx, chatId, editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}

async function openNewAgents(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const agents = (await oc.agents()).filter((agent) => !agent.hidden && ["primary", "all"].includes(agent.mode));
  chat.menu = { kind: "agents", source: "new", agents };
  ctx.store.save();
  await sendView(ctx, chatId, agentsView({ items: agents, prefix: "na", title: "Шаг 3/3. Агент" }), editId);
}

export async function pickNewAgent(ctx, chatId, index, editId) {
  const chat = chatOf(ctx, chatId);
  const agent = chat.menu?.agents?.[index];
  if (!agent) return showMain(ctx, chatId, editId);
  chat.wizard.agent = agent.id;
  await createWizardSession(ctx, chatId, editId);
}

async function createWizardSession(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const wizard = chat.wizard || {};
  const model = modelRef(wizard.model || ctx.config.defaultModel);
  try {
    const session = await oc.createSession({
      title: `TG · ${fmtDate(Date.now())}`,
      directory: wizard.directory || ctx.config.defaultDirectory,
      model,
      agent: wizard.agent || ctx.config.defaultAgent,
    });
    chat.activeSession = session.id;
    chat.gitCwd = null;
    chat.wizard = null;
    chat.menu = null;
    ctx.store.save();
    await ctx.tg.send(chatId, `✅ Сессия создана: <b>${esc(sessionTitle(session))}</b>\n<code>${esc(modelTitle(model))}</code> · ${esc(session.agent ?? "")}`);
    await showMain(ctx, chatId, editId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
}
