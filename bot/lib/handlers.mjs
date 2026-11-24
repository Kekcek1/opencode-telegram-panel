import * as actions from "./actions.mjs";
import { sessionRoute } from "./actions/routes.mjs";
import { allowed, logAccess } from "./auth.mjs";
import { btwCommand, runPrompt } from "./prompt.mjs";
import { fmtDate, esc } from "./format.mjs";
import { friendlyError } from "./opencode.mjs";
import { sendFileCommand } from "./files.mjs";
import { modelRef } from "./prefs.mjs";

function parseCommand(text) {
  const match = text.match(/^\/([A-Za-z0-9_]+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  return match ? { command: match[1].toLowerCase(), arg: (match[2] || "").trim() } : null;
}

async function commandError(ctx, chatId, error) {
  await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
}

async function stop(ctx, chatId) {
  const chat = ctx.store.chat(chatId);
  if (!chat.activeSession) {
    await ctx.tg.send(chatId, "Нет активной сессии.");
    return;
  }
  const oc = await ctx.service.client();
  await oc.interrupt(chat.activeSession);
  await ctx.tg.send(chatId, "⏹ Остановка отправлена.");
}

async function quickTask(ctx, chatId, text) {
  const chat = ctx.store.chat(chatId);
  if (chat.activeSession) {
    await runPrompt(ctx, chatId, text);
    return;
  }
  const oc = await ctx.service.client();
  const models = await oc.models();
  const found =
    models.find((item) => item.providerID === ctx.config.defaultModel.providerID && item.id === ctx.config.defaultModel.id) ||
    models.find((item) => item.enabled);
  const model = found ? modelRef(found) : ctx.config.defaultModel;
  const agent = ctx.config.defaultAgent || "build";
  const session = await oc.createSession({
    title: `TG task · ${fmtDate(Date.now())}`,
    directory: ctx.config.defaultDirectory,
    model,
    agent,
  });
  chat.activeSession = session.id;
  ctx.store.save();
  await ctx.tg.send(chatId, `✅ Задача создана в <b>${esc(session.title)}</b>`);
  await runPrompt(ctx, chatId, text);
}

async function command(ctx, msg, chatId, parsed) {
  const chat = ctx.store.chat(chatId);
  const { command: cmd, arg } = parsed;
  const oc = await ctx.service.client().catch((error) => {
    commandError(ctx, chatId, error);
    return null;
  });

  switch (cmd) {
    case "start":
    case "home":
    case "menu":
      await actions.showMain(ctx, chatId);
      ctx.presence?.start(chatId);
      return;
    case "help":
      return actions.showHelp(ctx, chatId);
    case "id":
    case "whoami":
      return ctx.tg.send(
        chatId,
        `🪪 id: <code>${msg.from.id}</code>\nusername: @${esc(msg.from.username || "—")}\nchat: <code>${chatId}</code>`,
      );
    case "sessions":
      return actions.openSessions(ctx, chatId, 0);
    case "groups":
      return actions.openGroups(ctx, chatId);
    case "new":
      return actions.openNew(ctx, chatId);
    case "model":
      if (arg) return actions.openModelSearch(ctx, chatId, arg);
      return actions.openModel(ctx, chatId);
    case "agent":
    case "plan": {
      if (!arg) return actions.openAgents(ctx, chatId);
      if (!oc || !chat.activeSession) return ctx.tg.send(chatId, "Сначала выбери сессию.");
      const agents = await oc.agents();
      const found = agents.find(
        (item) => item.id === arg || String(item.name || "").toLowerCase() === arg.toLowerCase(),
      );
      if (!found) return ctx.tg.send(chatId, `Агент «${esc(arg)}» не найден.`);
      await oc.setAgent(chat.activeSession, found.id);
      await ctx.tg.send(chatId, `🎛 Агент: <code>${esc(found.id)}</code>`);
      return actions.showMain(ctx, chatId);
    }
    case "report":
      return actions.openReport(ctx, chatId);
    case "status":
      return actions.openStatus(ctx, chatId);
    case "connections":
    case "conn":
      return actions.openConnections(ctx, chatId);
    case "favorites":
      return actions.openModelFavorites(ctx, chatId);
    case "live":
      if (!ctx.presence) return ctx.tg.send(chatId, "Live-панель ещё не запущена.");
      await ctx.presence.refresh(chatId);
      return ctx.tg.send(chatId, "📌 Live-панель обновлена.");
    case "service":
      return actions.openService(ctx, chatId);
    case "btw":
      return btwCommand(ctx, chatId, arg);
    case "send":
      return sendFileCommand(ctx, chatId, arg);
    case "stop":
      return stop(ctx, chatId);
    case "task":
      if (!arg) return ctx.tg.send(chatId, "Напиши задачу после /task.");
      return quickTask(ctx, chatId, arg);
    case "rename":
      if (!arg) {
        chat.mode = "rename";
        ctx.store.save();
        return ctx.tg.send(chatId, "Отправь новое название сессии.");
      }
      if (!oc || !chat.activeSession) return ctx.tg.send(chatId, "Сначала выбери сессию.");
      await oc.rename(chat.activeSession, arg);
      await ctx.tg.send(chatId, `✏️ Переименовано: <b>${esc(arg)}</b>`);
      return actions.showMain(ctx, chatId);
    case "delete":
      return actions.askDelete(ctx, chatId);
    case "cancel":
      chat.mode = null;
      chat.wizard = null;
      chat.menu = null;
      chat.noteModel = null;
      chat.detail = null;
      chat.groupPicker = null;
      chat.deleteTarget = null;
      chat.deleteGroup = null;
      ctx.store.save();
      return actions.showMain(ctx, chatId);
    case "git": {
      const [sub, ...rest] = arg.split(/\s+/);
      if (!sub) return actions.openGit(ctx, chatId);
      if (sub === "commit") {
        if (rest.length) return actions.finishGitCommit(ctx, chatId, rest.join(" "));
        return actions.startGitCommit(ctx, chatId);
      }
      if (["push", "pull", "log", "branches"].includes(sub)) return actions.gitAction(ctx, chatId, sub);
      return actions.openGit(ctx, chatId);
    }
    case "prompt":
      return ctx.tg.send(chatId, "Напиши текст сообщения — он уйдёт в выбранную сессию.");
    default:
      return ctx.tg.send(chatId, `Неизвестная команда: /${esc(cmd)}. /help`);
  }
}

async function callback(ctx, query) {
  const chatId = query.message?.chat?.id;
  if (!chatId) return;
  const editId = query.message?.message_id;
  const chat = ctx.store.chat(chatId);
  const data = query.data || "";
  const [head, tail] = data.split(":");
  const index = Number(tail);

  if (head === "home") return actions.showMain(ctx, chatId, editId);
  if (await sessionRoute(ctx, chatId, head, tail, index, editId)) return;
  if (head === "new") return actions.openNew(ctx, chatId, editId);
  if (head === "nd") return actions.pickDir(ctx, chatId, index, editId);
  if (head === "np") return actions.pickProvider(ctx, chatId, index, editId, "new");
  if (head === "nm") return actions.pickModel(ctx, chatId, index, editId, "new");
  if (head === "nv") return actions.pickVariant(ctx, chatId, index, editId, "new");
  if (head === "na") return actions.pickNewAgent(ctx, chatId, index, editId);
  if (head === "model") return actions.openModel(ctx, chatId, editId);
  if (head === "mfav") return actions.openModelFavorites(ctx, chatId, editId);
  if (head === "mall") return actions.openModelAll(ctx, chatId, editId);
  if (head === "mhidden") return actions.openHidden(ctx, chatId, editId);
  if (head === "fav") return actions.toggleFavoriteModel(ctx, chatId, index, editId);
  if (head === "hid") return actions.toggleHiddenModel(ctx, chatId, index, editId);
  if (head === "fpg") return actions.renderFavoritesPage(ctx, chatId, Number(tail) || 0, editId);
  if (head === "fnote") return actions.openNoteEditor(ctx, chatId, index, editId);
  if (head === "fclear") return actions.clearFavoriteNote(ctx, chatId, index, editId);
  if (head === "funfav") return actions.removeFavoriteModel(ctx, chatId, index, editId);
  if (head === "cc" && tail === "list") return actions.openConnectionPicker(ctx, chatId, editId);
  if (head === "cc") return actions.selectConnection(ctx, chatId, index, editId);
  if (head === "nav") return actions.showMain(ctx, chatId);
  if (head === "navs") return actions.openSessions(ctx, chatId, 0);
  if (head === "navnew") return actions.openNew(ctx, chatId);
  if (head === "live") return ctx.presence?.refresh(chatId);
  if (head === "rpt") return actions.openReportFor(ctx, chatId, tail, editId);
  if (head === "opn") return actions.openSessionById(ctx, chatId, tail, editId);
  if (head === "rep") return actions.openReportFor(ctx, chatId, tail, editId);
  if (head === "mp") return actions.pickProvider(ctx, chatId, index, editId, "set");
  if (head === "mm") return actions.pickModel(ctx, chatId, index, editId, "set");
  if (head === "mv") return actions.pickVariant(ctx, chatId, index, editId, "set");
  if (head === "agent") return actions.openAgents(ctx, chatId, editId);
  if (head === "ma") return actions.pickSetAgent(ctx, chatId, index, editId);
  if (head === "pg") {
    if (chat.menu?.kind === "models") return actions.renderModelsPage(ctx, chatId, Number(tail) || 0, editId);
    if (chat.menu?.kind === "hidden") return actions.renderHiddenPage(ctx, chatId, Number(tail) || 0, editId);
    if (chat.menu?.kind === "sessions") return actions.openSessions(ctx, chatId, Number(tail) || 0, editId);
    return actions.showMain(ctx, chatId, editId);
  }
  if (head === "connections") return actions.openConnections(ctx, chatId, editId);
  if (head === "cred") return actions.activateCredential(ctx, chatId, index, editId);
  if (head === "mcp") return actions.toggleMcp(ctx, chatId, index, editId);
  if (head === "gr" && tail === "list") return actions.openGitRepos(ctx, chatId, editId);
  if (head === "gr") return actions.selectGitRepo(ctx, chatId, index, editId);
  if (head === "git") {
    const action = tail || "status";
    if (action === "commit") return actions.startGitCommit(ctx, chatId, editId);
    if (["push", "pull", "log", "branches"].includes(action)) return actions.gitAction(ctx, chatId, action, editId);
    return actions.openGit(ctx, chatId, editId);
  }
  if (head === "report") return actions.openReport(ctx, chatId, editId);
  if (head === "status") return actions.openStatus(ctx, chatId, editId);
  if (head === "help") return actions.showHelp(ctx, chatId, editId);
  if (head === "prompt") return ctx.tg.send(chatId, "Напиши текст сообщения — он уйдёт в выбранную сессию.");
  if (head === "stop") return stop(ctx, chatId);
  if (head === "delete") return actions.askDelete(ctx, chatId, editId);
  if (head === "svc" && tail === "list") return actions.openService(ctx, chatId, editId);
  if (head === "svc") return actions.selectService(ctx, chatId, index, editId);
  return actions.showMain(ctx, chatId, editId);
}

export async function handleUpdate(ctx, update) {
  const msg = update.message;
  const query = update.callback_query;
  const from = msg?.from ?? query?.from;
  if (!from || from.is_bot) return;
  if (!allowed(ctx.config, from)) {
    logAccess(ctx.config, from, msg?.text || query?.data || "");
    if (query) await ctx.tg.answerCallback(query.id, "Нет доступа");
    return;
  }

  if (query) {
    await ctx.tg.answerCallback(query.id);
    try {
      await callback(ctx, query);
    } catch (error) {
      await ctx.tg.send(query.message.chat.id, `❌ ${esc(friendlyError(error))}`);
    }
    return;
  }

  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const parsed = text.startsWith("/") ? parseCommand(text) : null;
  const chat = ctx.store.chat(chatId);

  try {
    if (parsed) {
      await command(ctx, msg, chatId, parsed);
      return;
    }
    if (chat.mode === "git-commit") {
      await actions.finishGitCommit(ctx, chatId, text);
      return;
    }
    if (chat.mode === "rename") {
      const oc = await ctx.service.client();
      if (!chat.activeSession) return ctx.tg.send(chatId, "Сессия не выбрана.");
      await oc.rename(chat.activeSession, text);
      chat.mode = null;
      ctx.store.save();
      await ctx.tg.send(chatId, `✏️ Переименовано: <b>${esc(text)}</b>`);
      return actions.showMain(ctx, chatId);
    }
    if (chat.mode === "favorite-note") {
      return actions.saveFavoriteNote(ctx, chatId, text);
    }
    if (chat.mode === "group-create" || chat.mode === "group-new") {
      return actions.finishGroupName(ctx, chatId, text, undefined);
    }
    if (chat.mode === "group-rename") {
      return actions.finishGroupRename(ctx, chatId, text, undefined);
    }
    if (chat.mode === "session-rename") {
      return actions.finishSessionRename(ctx, chatId, text, undefined);
    }
    if (!chat.activeSession) {
      await ctx.tg.send(chatId, "Сессия не выбрана. Открой /sessions или создай /new.");
      return actions.openSessions(ctx, chatId, 0);
    }
    await runPrompt(ctx, chatId, text);
  } catch (error) {
    await commandError(ctx, chatId, error);
  }
}
