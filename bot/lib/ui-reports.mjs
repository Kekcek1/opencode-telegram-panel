import {
  assistantView,
  clip,
  esc,
  fmtCost,
  fmtDate,
  fmtDuration,
  fmtTokens,
  modelLabel,
  sessionTitle,
} from "./format.mjs";

const kb = (rows) => ({ inline_keyboard: rows.filter((row) => row.length) });
const home = [{ text: "🏠 Меню", callback_data: "home" }];

function bar(value, total, width = 10) {
  if (!total) return "░".repeat(width);
  const fill = Math.max(0, Math.min(width, Math.round((Number(value) / total) * width)));
  return `${"█".repeat(fill)}${"░".repeat(width - fill)}`;
}

function statusText(session) {
  if (session?.outcome === "succeeded") return "✅ succeeded";
  if (session?.outcome === "failed") return "❌ failed";
  if (session?.outcome === "running") return "🟠 running";
  return `• ${session?.outcome ?? "idle"}`;
}

function toolStats(messages) {
  let calls = 0;
  let ok = 0;
  let failed = 0;
  for (const message of messages ?? []) {
    for (const part of message.content ?? []) {
      if (part.type !== "tool") continue;
      calls++;
      if (part.state?.status === "completed") ok++;
      else if (part.state?.status === "error") failed++;
    }
  }
  return { calls, ok, failed };
}

function lastAnswer(messages) {
  const message = (messages ?? []).find((item) => item.type === "assistant" && assistantView(item).text);
  return message ? assistantView(message).text : "";
}

export function reportView({ session, messages, gitInfo, cwd }) {
  const tokens = session?.tokens ?? {};
  const input = Number(tokens.input) || 0;
  const output = Number(tokens.output) || 0;
  const reasoning = Number(tokens.reasoning) || 0;
  const total = input + output + reasoning;
  const tools = toolStats(messages);
  const answer = lastAnswer(messages);
  const duration = session?.time?.created ? fmtDuration((session.time.updated ?? Date.now()) - session.time.created) : "—";
  const lines = [
    "<b>📊 Отчёт по сессии</b>",
    `<b>${esc(sessionTitle(session))}</b>`,
    `<code>${esc(clip(session?.location?.directory ?? cwd ?? "—", 78))}</code>`,
    "",
    `🧠 <code>${esc(modelLabel(session?.model))}</code> · 🎛 <code>${esc(session?.agent ?? "—")}</code>`,
    `📌 ${statusText(session)} · ⏱ ${duration}`,
    "",
    "<b>🔤 Токены</b>",
    `<code>in  ${bar(input, total)} ${fmtTokens(input)}</code>`,
    `<code>out ${bar(output, total)} ${fmtTokens(output)}</code>`,
    `<code>rez ${bar(reasoning, total)} ${fmtTokens(reasoning)}</code>`,
    `cache: ${fmtTokens(tokens.cache?.read)} read · ${fmtTokens(tokens.cache?.write)} write`,
    "",
    `💰 <b>Стоимость</b> ${fmtCost(session?.cost)} · 🧰 <b>Инструменты</b> ${tools.calls} (${tools.ok} ok${tools.failed ? `, ${tools.failed} failed` : ""})`,
  ];
  if (gitInfo?.repo) lines.push(`🌿 <b>Git</b> <code>${esc(gitInfo.branch)}</code> · изменений ${gitInfo.dirty}${gitInfo.ahead ? ` · ahead ${gitInfo.ahead}` : ""}`);
  if (answer) lines.push("", "<b>Последний ответ</b>", `<blockquote>${esc(clip(answer, 1200))}</blockquote>`);
  else lines.push("", "<i>Текстового ответа пока нет.</i>");
  return {
    text: lines.join("\n"),
    keyboard: kb([
      [{ text: "🔄 Обновить", callback_data: `rep:${session?.id ?? ""}` }, { text: "🌿 Git", callback_data: "git" }],
      [{ text: "📋 Сессии", callback_data: "sessions" }],
      home,
    ]),
  };
}

export function finishView({ session, messages }) {
  const tokens = session?.tokens ?? {};
  const input = Number(tokens.input) || 0;
  const output = Number(tokens.output) || 0;
  const reasoning = Number(tokens.reasoning) || 0;
  const total = input + output + reasoning;
  const answer = lastAnswer(messages);
  const duration = session?.time?.created ? fmtDuration((session.time.updated ?? Date.now()) - session.time.created) : "—";
  const lines = [
    "✅ <b>Сессия завершена</b>",
    `<b>${esc(sessionTitle(session))}</b>`,
    `<code>${esc(modelLabel(session?.model))}</code> · 🎛 <code>${esc(session?.agent ?? "—")}</code>`,
    `⏱ ${duration} · 💰 ${fmtCost(session?.cost)} · 🔤 ${fmtTokens(total)}`,
  ];
  if (answer) lines.push("", `<blockquote>${esc(clip(answer, 650))}</blockquote>`);
  return {
    text: lines.join("\n"),
    keyboard: kb([
      [{ text: "📊 Отчёт", callback_data: `rpt:${session?.id ?? ""}` }, { text: "🖥 Открыть", callback_data: `opn:${session?.id ?? ""}` }],
      [{ text: "📋 Сессии", callback_data: "sessions" }],
    ]),
  };
}

export function liveView({ activeSessions, sessions, now = Date.now() }) {
  const lines = ["📌 <b>Активные сессии</b>"];
  if (activeSessions.length) {
    for (const session of activeSessions.slice(0, 8)) {
      lines.push(
        `🟠 <b>${esc(clip(sessionTitle(session), 42))}</b>\n   <code>${esc(clip(modelLabel(session.model), 46))}</code> · ${fmtDate(session.time?.updated)}`,
      );
    }
    if (activeSessions.length > 8) lines.push(`… и ещё ${activeSessions.length - 8}`);
  } else {
    lines.push("Сейчас нет активных сессий.");
    const last = sessions?.[0];
    if (last) lines.push(`Последняя: <b>${esc(clip(sessionTitle(last), 42))}</b> · ${fmtDate(last.time?.updated)}`);
  }
  lines.push("", `<i>Обновлено ${fmtDate(now)}</i>`);
  return {
    text: lines.join("\n"),
    keyboard: kb([
      [{ text: "🏠 Меню", callback_data: "nav" }, { text: "📋 Сессии", callback_data: "navs" }],
      [{ text: "➕ Новая", callback_data: "navnew" }, { text: "🔄 Обновить", callback_data: "live" }],
    ]),
  };
}
