import { clip, esc, fmtDate, modelLabel, sessionTitle } from "./format.mjs";

const kb = (rows) => ({ inline_keyboard: rows.filter((row) => row.length) });
const home = [{ text: "🏠 Меню", callback_data: "home" }];

export function groupsView({ items, ungrouped, total }) {
  const lines = [
    "<b>📁 Группы сессий</b>",
    `Всего сессий: <b>${total}</b> · без группы: <b>${ungrouped}</b>`,
    "Категории общие с плагином сессий в TUI.",
  ];
  if (!items.length) lines.push("Групп пока нет. Создай первую.");
  for (const item of items) lines.push(`📁 <b>${esc(item.name)}</b> · ${item.count}`);
  const rows = items.map((item, index) => [
    { text: `📁 ${clip(item.name, 34)} · ${item.count}`, callback_data: `grp:${index}` },
  ]);
  rows.push([{ text: `🚫 Без группы · ${ungrouped}`, callback_data: "grp:none" }]);
  rows.push([{ text: "➕ Новая группа", callback_data: "gnew" }]);
  rows.push([{ text: "📋 Все сессии", callback_data: "sessions" }, home]);
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function groupPickerView({ groups, current, session }) {
  const lines = [
    "<b>📁 Группа сессии</b>",
    `<b>${esc(sessionTitle(session))}</b>`,
    `Сейчас: ${current ? `📁 ${esc(current)}` : "без группы"}`,
  ];
  const rows = groups.map((name, index) => [
    {
      text: `${name === current ? "✅" : "📁"} ${clip(name, 34)}`,
      callback_data: `sgp:${index}`,
    },
  ]);
  rows.push([{ text: "🚫 Убрать из группы", callback_data: "sgnone" }]);
  rows.push([{ text: "➕ Новая группа", callback_data: "sgnew" }]);
  rows.push([{ text: "⬅️ Назад", callback_data: "sback" }]);
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function sessionDetailView({ session, group, active, running }) {
  const lines = [
    "<b>⚙️ Сессия</b>",
    `<b>${esc(sessionTitle(session))}</b>`,
    `Группа: ${group ? `📁 ${esc(group)}` : "без группы"}`,
    `Модель: <code>${esc(modelLabel(session.model))}</code> · агент <code>${esc(session.agent ?? "—")}</code>`,
    `Папка: <code>${esc(clip(session.location?.directory ?? "—", 80))}</code>`,
    `Обновлена: ${fmtDate(session.time?.updated)} · ${active ? "✅ активна" : running ? "🟠 работает" : "🟢 idle"}`,
  ];
  return {
    text: lines.join("\n"),
    keyboard: kb([
      [{ text: active ? "✅ Выбрана" : "✅ Выбрать", callback_data: "sdp" }, { text: "📁 Группа", callback_data: "sdg" }],
      [{ text: "✏️ Переименовать", callback_data: "sdr" }, { text: "🗑 Удалить", callback_data: "sdd" }],
      [{ text: "⬅️ Назад", callback_data: "sback" }],
    ]),
  };
}

export function confirmDeleteSession({ session }) {
  return {
    text: `🗑 Удалить сессию <b>${esc(sessionTitle(session))}</b>?\nОна исчезнет из OpenCode на ПК и из групп.`,
    keyboard: kb([
      [{ text: "🗑 Удалить", callback_data: "sdel:yes" }, { text: "✖️ Отмена", callback_data: "sback" }],
    ]),
  };
}

export function confirmDeleteGroup({ name, count }) {
  return {
    text: `🗑 Удалить группу <b>${esc(name)}</b>?\nСессии не удаляются, они станут без группы. Сейчас в группе ${count}.`,
    keyboard: kb([
      [{ text: "🗑 Удалить группу", callback_data: "gdel:yes" }, { text: "✖️ Отмена", callback_data: "gback" }],
    ]),
  };
}

export function renamePrompt({ kind, current }) {
  const what = kind === "group" ? `группы «${current}»` : `сессии «${current}»`;
  return {
    text: `<b>✏️ Новое имя</b>\nОтправь новое название ${esc(what)}.`,
    keyboard: kb([[{ text: "✖️ Отмена", callback_data: "sback" }]]),
  };
}
