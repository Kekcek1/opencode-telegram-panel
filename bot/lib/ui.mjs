import {
  assistantView,
  clip,
  esc,
  fmtCost,
  fmtDate,
  fmtTokens,
  modelLabel,
  modelTitle,
  sessionTitle,
} from "./format.mjs";

const kb = (rows) => ({ inline_keyboard: rows.filter((row) => row.length) });
const home = [{ text: "🏠 Меню", callback_data: "home" }];

export function mainView({ botName, service, session, activeMap, running }) {
  const lines = [`<b>🧠 ${esc(botName)}</b>`];
  if (service) {
    lines.push(`Сервис: <code>${esc(service.url)}</code> · v${esc(service.info?.version ?? "?")}`);
  } else {
    lines.push("Сервис: ❌ недоступен");
  }
  if (session) {
    lines.push(`Сессия: <b>${esc(sessionTitle(session))}</b>`);
    lines.push(`Папка: <code>${esc(clip(session.location?.directory ?? "—", 70))}</code>`);
    lines.push(`Модель: <code>${esc(modelLabel(session.model))}</code>`);
    lines.push(`Агент: <code>${esc(session.agent ?? "—")}</code>`);
    lines.push(`Статус: ${running || activeMap?.[session.id] ? "🟠 работает" : "🟢 idle"}`);
  } else {
    lines.push("Сессия: <i>не выбрана</i>");
  }
  const rows = [
    [{ text: "📋 Сессии", callback_data: "sessions" }, { text: "➕ Новая", callback_data: "new" }],
    [{ text: "🧠 Модель", callback_data: "model" }, { text: "🎛 Агент / план", callback_data: "agent" }],
    [{ text: "✍️ Задача", callback_data: "prompt" }, { text: "📊 Отчёт", callback_data: "report" }],
    [{ text: "🔌 Коннекты", callback_data: "connections" }, { text: "🌿 Git", callback_data: "git" }],
    [{ text: "🔄 Статус", callback_data: "status" }, { text: "❓ Помощь", callback_data: "help" }],
  ];
  if (!session) rows.unshift([{ text: "🖥 Взять сессию с ПК", callback_data: "sess:pc" }]);
  if (running) rows.push([{ text: "⏹ Остановить", callback_data: "stop" }]);
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function sessionsView({ items, page, activeId, activeMap, hasNext }) {
  const lines = [`<b>📋 Сессии</b> · стр. ${page + 1}`];
  if (!items.length) lines.push("Пусто.");
  items.forEach((s, index) => {
    const mark = s.id === activeId ? "✅" : activeMap?.[s.id] ? "🟠" : "•";
    lines.push(
      `${mark} <b>${esc(clip(sessionTitle(s), 40))}</b>\n   ${fmtDate(s.time?.updated)} · <code>${esc(modelTitle(s.model))}</code> · ${fmtCost(s.cost)}`,
    );
  });
  const rows = items.map((s, index) => [
    { text: `${index + 1}. ${clip(sessionTitle(s), 42)}`, callback_data: `si:${index}` },
  ]);
  rows.push([
    { text: "⬅️", callback_data: `slist:${Math.max(0, page - 1)}` },
    { text: "➡️", callback_data: `slist:${page + 1}` },
  ]);
  rows.push([{ text: "🖥 Взять с ПК", callback_data: "sess:pc" }]);
  rows.push(home);
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function dirsView({ items }) {
  const rows = items.map((dir, index) => [
    { text: `📁 ${clip(dir, 48)}`, callback_data: `nd:${index}` },
  ]);
  rows.push([{ text: "✖️ Отмена", callback_data: "home" }]);
  return {
    text: "<b>➕ Новая сессия</b>\nШаг 1/3. Выбери папку проекта.",
    keyboard: kb(rows),
  };
}

export function providersView({ items, prefix, title }) {
  const rows = items.map((item, index) => [
    {
      text: `${item.name} · ${item.count}`,
      callback_data: `${prefix}:${index}`,
    },
  ]);
  rows.push([{ text: "✖️ Отмена", callback_data: "home" }]);
  return {
    text: `<b>${esc(title)}</b>\nВыбери провайдера.`,
    keyboard: kb(rows),
  };
}

export function variantsView({ items, prefix, model }) {
  const rows = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push(items.slice(i, i + 3).map((variant, offset) => ({
      text: variant,
      callback_data: `${prefix}:${i + offset}`,
    })));
  }
  rows.push([{ text: "✖️ Отмена", callback_data: "home" }]);
  return {
    text: `<b>🧠 ${esc(modelTitle(model))}</b>\nВыбери уровень мышления.`,
    keyboard: kb(rows),
  };
}

export function agentsView({ items, prefix, title }) {
  const rows = items.map((agent, index) => [
    {
      text: `${agent.name} · ${agent.mode}`,
      callback_data: `${prefix}:${index}`,
    },
  ]);
  rows.push([{ text: "✖️ Отмена", callback_data: "home" }]);
  return {
    text: `<b>${esc(title)}</b>\nВыбери агента. <code>build</code> — обычная работа, <code>plan</code> — только план.`,
    keyboard: kb(rows),
  };
}

export function connectionsView({ providers, credentials, mcp, counts }) {
  const lines = ["<b>🔌 Подключения</b>"];
  for (const provider of providers) {
    const count = counts?.[provider.id] ?? 0;
    lines.push(`${provider.activation === "enabled" ? "🟢" : "🟡"} <b>${esc(provider.name)}</b> · ${count} моделей`);
  }
  lines.push("\n<b>🔑 Ключи</b>");
  for (const credential of credentials) {
    lines.push(`${credential.active ? "✅" : "○"} ${esc(credential.label)} · <code>${esc(credential.integrationID)}</code>`);
  }
  lines.push("\n<b>🧩 MCP</b>");
  if (!mcp.length) lines.push("нет серверов");
  for (const server of mcp) lines.push(`${server.status?.status === "connected" ? "🟢" : "🔴"} ${esc(server.name)} · ${esc(server.status?.status ?? "?")}`);
  const rows = [];
  for (let i = 0; i < credentials.length; i += 2) {
    rows.push(credentials.slice(i, i + 2).map((credential, offset) => ({
      text: `${credential.active ? "✅" : "🔑"} ${clip(credential.label, 20)}`,
      callback_data: `cred:${i + offset}`,
    })));
  }
  for (let i = 0; i < mcp.length; i++) {
    const connected = mcp[i].status?.status === "connected";
    rows.push([{ text: `${connected ? "🔌 Отключить" : "🔗 Подключить"} ${clip(mcp[i].name, 20)}`, callback_data: `mcp:${i}` }]);
  }
  rows.push([{ text: "🔄 Обновить", callback_data: "connections" }]);
  rows.push(home);
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function gitView({ info, cwd }) {
  if (!info?.repo) {
    return {
      text: `<b>🌿 Git</b>\n<code>${esc(clip(cwd, 80))}</code>\nНе git-репозиторий.\n${esc(clip(info?.error ?? "", 300))}`,
      keyboard: kb([
        [{ text: "📁 Выбрать репо", callback_data: "gr:list" }],
        [{ text: "🔄 Обновить", callback_data: "git" }],
        home,
      ]),
    };
  }
  const lines = [
    "<b>🌿 Git</b>",
    `Папка: <code>${esc(clip(cwd, 80))}</code>`,
    `Ветка: <code>${esc(info.branch)}</code>`,
    `Изменений: <b>${info.dirty}</b>${info.ahead ? ` · ahead ${info.ahead}` : ""}${info.behind ? ` · behind ${info.behind}` : ""}`,
    `Последний: <code>${esc(clip(info.last, 70))}</code>`,
  ];
  if (info.dirty) lines.push(`\n${info.files.map((f) => `• <code>${esc(clip(f, 80))}</code>`).join("\n")}`);
  const rows = [
    [{ text: "💾 Коммит", callback_data: "git:commit" }, { text: "🚀 Пуш", callback_data: "git:push" }],
    [{ text: "⬇️ Пулл", callback_data: "git:pull" }, { text: "📜 История", callback_data: "git:log" }],
    [{ text: "🌿 Ветки", callback_data: "git:branches" }, { text: "🔄 Обновить", callback_data: "git" }],
    [{ text: "📁 Репо", callback_data: "gr:list" }],
    home,
  ];
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function gitReposView({ items, current }) {
  const rows = items.map((path, index) => [
    { text: `${path === current ? "✅" : "📁"} ${clip(path, 50)}`, callback_data: `gr:${index}` },
  ]);
  rows.push([{ text: "⬅️ Назад", callback_data: "git" }]);
  rows.push(home);
  return { text: "<b>🌿 Репозиторий</b>\nВыбери папку для Git-операций.", keyboard: kb(rows) };
}

export function gitLogView({ title, text }) {
  return {
    text: `<b>🌿 ${esc(title)}</b>\n<code>${esc(clip(text || "(пусто)", 3500))}</code>`,
    keyboard: kb([[{ text: "⬅️ Назад", callback_data: "git" }], home]),
  };
}

export function statusView({ service, session, activeMap, stats, freeGb }) {
  const tokens = stats?.tokens ?? {};
  const lines = [
    "<b>🔄 Статус</b>",
    service ? `Сервис: <code>${esc(service.url)}</code> · v${esc(service.info?.version ?? "?")}` : "Сервис: ❌",
    `Сессия: ${session ? `<b>${esc(sessionTitle(session))}</b> ${activeMap?.[session.id] ? "🟠" : "🟢"}` : "не выбрана"}`,
    `Свободно на G: <b>${esc(freeGb)}</b>`,
    `Всего сессий: <b>${stats?.sessions ?? "?"}</b> · промтов: ${stats?.prompts ?? "?"}`,
    `Токены: ${fmtTokens(tokens.input)} in / ${fmtTokens(tokens.output)} out`,
    `Расход: ${fmtCost(stats?.cost)}`,
    `Инструменты: ${stats?.tools?.totals?.calls ?? "?"} вызовов`,
  ];
  return {
    text: lines.join("\n"),
    keyboard: kb([
      [{ text: "🔄 Обновить", callback_data: "status" }, { text: "🔌 Коннекты", callback_data: "connections" }],
      home,
    ]),
  };
}

export function serviceView({ items, selected }) {
  const rows = items.map((item, index) => [
    {
      text: `${item.ok ? (item.path === selected ? "✅" : "🟢") : "🔴"} ${clip(item.url ?? item.path, 44)}`,
      callback_data: `svc:${index}`,
    },
  ]);
  rows.push([{ text: "🔄 Обновить", callback_data: "svc:list" }]);
  rows.push(home);
  return { text: "<b>🖥 Сервис OpenCode</b>\nВыбери, к какому запущенному сервису подключаться.", keyboard: kb(rows) };
}

export function helpView() {
  const text = [
    "<b>❓ Помощь</b>",
    "Сессии общие с ПК: бот работает через тот же сервис OpenCode.",
    "",
    "<b>Команды</b>",
    "/sessions — список и выбор сессии",
    "/new — новая сессия",
    "/model — сменить модель",
    "/agent или /plan — сменить агента",
    "/report — отчёт по сессии",
    "/git — статус, коммит, пуш",
    "/connections — провайдеры, ключи, MCP",
    "/service — выбрать сервис",
    "/status — состояние",
    "/btw текст — вклиниться в текущую работу",
    "/stop — прервать генерацию",
    "/rename текст — переименовать сессию",
    "/delete — удалить сессию",
    "/id — твой Telegram ID",
    "",
    "Обычный текст отправляется в выбранную сессию.",
  ].join("\n");
  return { text, keyboard: kb([home]) };
}

export function confirmDelete({ session }) {
  return {
    text: `Удалить сессию <b>${esc(sessionTitle(session))}</b>?\nЭто удалит её из OpenCode на ПК.`,
    keyboard: kb([
      [{ text: "🗑 Удалить", callback_data: "sess:del" }, { text: "✖️ Отмена", callback_data: "home" }],
    ]),
  };
}

export { modelsView, hiddenView, modelHomeView, connectionPickerView } from "./ui-models.mjs";
export { reportView, finishView, liveView } from "./ui-reports.mjs";
