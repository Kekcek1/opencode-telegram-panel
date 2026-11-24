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
import { friendlyError } from "./opencode.mjs";

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

export async function runPrompt(ctx, chatId, text, options = {}) {
  const chat = ctx.store.chat(chatId);
  const sessionId = chat.activeSession;
  if (!sessionId) {
    await ctx.tg.send(chatId, "Сначала выбери сессию или создай новую.");
    return;
  }

  const delivery = options.delivery ?? "queue";
  const label = options.label ?? "Промт";

  if (delivery === "steer" && chat.running) {
    const oc = await ctx.service.client();
    await oc.prompt(sessionId, text, "steer");
    await ctx.tg.send(chatId, "↪️ BTW отправлен в текущую работу.");
    return;
  }
  if (chat.running) {
    await ctx.tg.send(chatId, "Уже выполняется другой промт. Дождись ответа, /stop для остановки или /btw для вклинивания.");
    return;
  }

  const oc = await ctx.service.client();
  const started = Date.now();
  let progressId = null;
  let finished = false;
  chat.running = true;
  ctx.store.save();

  try {
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
    const deadline = started + (ctx.config.promptTimeoutMs ?? 900000);

    while (Date.now() < deadline) {
      await sleep(1500);
      const [fresh, messages] = await Promise.all([
        oc.session(sessionId),
        oc.messages(sessionId, 20, "desc"),
      ]);
      assistant = messages.find(
        (message) =>
          message.type === "assistant" &&
          (message.time?.created ?? 0) >= started - 2000,
      );
      if (!assistant) {
        if (Date.now() - lastEdit > (ctx.config.progressIntervalMs ?? 5000)) {
          lastEdit = Date.now();
          ctx.tg.typing(chatId);
          await ctx.tg.edit(
            chatId,
            progressId,
            `⏳ <b>${esc(label)}</b> · ${fmtDuration(Date.now() - started)}\nОжидаю ответа…`,
          ).catch(() => {});
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
        await ctx.tg.edit(
          chatId,
          progressId,
          [
            `⏳ <b>${esc(label)}</b> · ${fmtDuration(Date.now() - started)}`,
            `<code>${esc(modelLabel(assistant.model))}</code>`,
            collectTools(view),
            `<i>${esc(fresh.outcome ?? "работает")}</i>`,
          ].filter(Boolean).join("\n"),
        ).catch(() => {});
      }
    }

    if (!finished || !assistant) {
      await ctx.tg.edit(
        chatId,
        progressId,
        `⏳ <b>${esc(label)}</b> всё ещё выполняется.\n/report — состояние, /stop — остановить.`,
      ).catch(() => {});
      return;
    }

    const sessionNow = await oc.session(sessionId);
    if (assistant.finish === "error") {
      const reason = assistant.error?.message || "модель вернула ошибку";
      await ctx.tg.edit(chatId, progressId, `❌ <b>Ошибка</b>\n${esc(clip(reason, 1500))}`);
      return;
    }

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
  } catch (error) {
    const message = friendlyError(error);
    if (progressId) await ctx.tg.edit(chatId, progressId, `❌ <b>Ошибка</b>\n${esc(clip(message, 1800))}`).catch(() => {});
    else await ctx.tg.send(chatId, `❌ ${esc(clip(message, 1800))}`);
  } finally {
    chat.running = false;
    ctx.store.save();
  }
}
