import {
  assistantView,
  clip,
  esc,
  fmtCost,
  fmtDuration,
  fmtTokens,
  modelLabel,
  sleep,
} from "./format.mjs";
import { collectPromptFiles, sendPath } from "./files.mjs";
import { friendlyError } from "./opencode.mjs";

const BTW_INSTRUCTION = [
  "Answer the side question using this session's context.",
  "Do not call tools, do not change files and do not modify session history.",
  "Reply in the same language as the question. Be concise.",
].join(" ");

function collectTools(view) {
  const names = [...new Set(view.tools.map((tool) => tool.name))];
  return names.length ? `🔧 ${names.slice(0, 8).join(", ")}` : "";
}

function finalText({ assistant, view, session, elapsed, label }) {
  const header = `${label === "BTW" ? "↪️ BTW" : "✅ Готово"} · ${fmtDuration(elapsed)}`;
  const meta = `<code>${esc(modelLabel(session.model ?? assistant.model))}</code> · агент <code>${esc(assistant.agent ?? session.agent ?? "—")}</code>`;
  const tools = collectTools(view);
  const body = view.text ? esc(view.text) : "<i>Нет текстового ответа. Проверь сессию на ПК.</i>";
  const tokens = assistant.tokens ?? session.tokens ?? {};
  const footer = `${fmtTokens(tokens.input)} in · ${fmtTokens(tokens.output)} out · ${fmtCost(assistant.cost ?? session.cost)}`;
  return [header, meta, tools, "", body, "", footer].filter((line) => line !== undefined).join("\n");
}

function track(ctx, task) {
  ctx.tasks ??= new Set();
  ctx.tasks.add(task);
  task.finally(() => ctx.tasks.delete(task));
  return task;
}

export function runPrompt(ctx, chatId, text, options = {}) {
  const chat = ctx.store.chat(chatId);
  const sessionId = chat.activeSession;
  if (!sessionId) return ctx.tg.send(chatId, "Сначала выбери сессию или создай новую.");
  if (chat.running) {
    return ctx.tg.send(
      chatId,
      "Уже выполняется другой промт. Можно продолжать пользоваться меню, /btw для вопроса или /stop для остановки.",
    );
  }
  chat.running = true;
  ctx.store.save();
  return track(ctx, executePrompt(ctx, { chat, chatId, sessionId, text, options }));
}

async function executePrompt(ctx, { chat, chatId, sessionId, text, options }) {
  const delivery = options.delivery ?? "queue";
  const label = options.label ?? "Промт";
  const started = Date.now();
  let progressId = null;
  let messages = [];
  ctx.activePrompts ??= new Set();
  ctx.activePrompts.add(sessionId);

  try {
    const oc = await ctx.service.client();
    const session = await oc.session(sessionId);
    progressId = await ctx.tg.send(
      chatId,
      `⏳ <b>${esc(label)} принят</b>\n<code>${esc(clip(text, 240))}</code>`,
    );
    await oc.prompt(sessionId, text, delivery);

    let lastEdit = 0;
    let lastToolCount = -1;
    let assistant = null;
    let view = null;
    let finished = false;
    const deadline = started + (ctx.config.promptTimeoutMs ?? 900000);

    while (Date.now() < deadline) {
      await sleep(1500);
      const [fresh, recent] = await Promise.all([
        oc.session(sessionId),
        oc.messages(sessionId, 20, "desc"),
      ]);
      messages = recent;
      assistant = recent.find(
        (message) =>
          message.type === "assistant" &&
          (message.time?.created ?? 0) >= started - 2000,
      );
      if (!assistant) {
        if (Date.now() - lastEdit > (ctx.config.progressIntervalMs ?? 5000)) {
          lastEdit = Date.now();
          ctx.tg.typing(chatId);
          await ctx.tg
            .edit(chatId, progressId, `⏳ <b>${esc(label)}</b> · ${fmtDuration(Date.now() - started)}\nОжидаю ответа…`)
            .catch(() => {});
        }
        continue;
      }

      view = assistantView(assistant);
      const done = Boolean(assistant.time?.completed) || ["stop", "error", "length"].includes(assistant.finish);
      if (done) {
        finished = true;
        break;
      }
      if (view.tools.length !== lastToolCount || Date.now() - lastEdit > (ctx.config.progressIntervalMs ?? 5000)) {
        lastToolCount = view.tools.length;
        lastEdit = Date.now();
        ctx.tg.typing(chatId);
        await ctx.tg
          .edit(
            chatId,
            progressId,
            [
              `⏳ <b>${esc(label)}</b> · ${fmtDuration(Date.now() - started)}`,
              `<code>${esc(modelLabel(assistant.model))}</code>`,
              collectTools(view),
              `<i>${esc(fresh.outcome ?? "работает")}</i>`,
            ].filter(Boolean).join("\n"),
          )
          .catch(() => {});
      }
    }

    if (!finished || !assistant) {
      await ctx.tg
        .edit(chatId, progressId, `⏳ <b>${esc(label)}</b> всё ещё выполняется.\n/report — состояние, /stop — остановить.`)
        .catch(() => {});
      return;
    }

    if (assistant.finish === "error") {
      const reason = assistant.error?.message || "модель вернула ошибку";
      await ctx.tg.edit(chatId, progressId, `❌ <b>Ошибка</b>\n${esc(clip(reason, 1500))}`);
      return;
    }

    const sessionNow = await oc.session(sessionId);
    const result = finalText({
      assistant,
      view,
      session: sessionNow ?? session,
      elapsed: Date.now() - started,
      label,
    });
    await ctx.tg.edit(chatId, progressId, `✅ <b>${esc(label)}</b> · ${fmtDuration(Date.now() - started)}`);
    const parts = result.split("\n");
    const head = parts.slice(0, 4).join("\n");
    const body = parts.slice(4).join("\n");
    await ctx.tg.send(chatId, `${head}\n${body}`);
    ctx.lastPromptReports ??= {};
    ctx.lastPromptReports[sessionId] = Date.now();

    const files = collectPromptFiles({
      messages,
      directory: sessionNow?.location?.directory ?? session.location?.directory,
      promptText: text,
      started,
    });
    for (const file of files) await sendPath(ctx, chatId, file, { quiet: true });
  } catch (error) {
    const message = friendlyError(error);
    if (progressId) await ctx.tg.edit(chatId, progressId, `❌ <b>Ошибка</b>\n${esc(clip(message, 1800))}`).catch(() => {});
    else await ctx.tg.send(chatId, `❌ ${esc(clip(message, 1800))}`);
  } finally {
    ctx.activePrompts?.delete(sessionId);
    chat.running = false;
    ctx.store.save();
  }
}

export function btwCommand(ctx, chatId, arg) {
  if (!arg) return ctx.tg.send(chatId, "Напиши вопрос после /btw.");
  return runBtw(ctx, chatId, arg);
}

export function runBtw(ctx, chatId, text) {
  const chat = ctx.store.chat(chatId);
  const sessionId = chat.activeSession;
  if (!sessionId) return ctx.tg.send(chatId, "Сначала выбери сессию.");
  return track(ctx, executeBtw(ctx, { chatId, sessionId, text }));
}

async function executeBtw(ctx, { chatId, sessionId, text }) {
  const started = Date.now();
  let progressId = null;
  try {
    const oc = await ctx.service.client();
    progressId = await ctx.tg.send(
      chatId,
      `↪️ <b>BTW</b>\n<code>${esc(clip(text, 500))}</code>\n<i>Отвечаю по контексту, не меняя историю сессии.</i>`,
    );
    const answer = await oc.generate(sessionId, `${BTW_INSTRUCTION}\n\n${text}`);
    const body = answer ? esc(clip(answer, 3500)) : "<i>Модель не вернула текст.</i>";
    await ctx.tg.edit(
      chatId,
      progressId,
      `↪️ <b>BTW</b> · ${fmtDuration(Date.now() - started)}\n\n${body}`,
    );
  } catch (error) {
    const message = friendlyError(error);
    if (progressId) {
      await ctx.tg.edit(chatId, progressId, `❌ <b>BTW</b>\n${esc(clip(message, 1800))}`).catch(() => {});
    } else {
      await ctx.tg.send(chatId, `❌ <b>BTW</b>\n${esc(clip(message, 1800))}`);
    }
  }
}
