import { clip, esc, modelTitle } from "./format.mjs";

const kb = (rows) => ({ inline_keyboard: rows.filter((row) => row.length) });
const home = [{ text: "🏠 Меню", callback_data: "home" }];

export function modelsView({ items, page, prefix, title, subtitle, back = "home" }) {
  const lines = [`<b>${esc(title)}</b>`];
  if (subtitle) lines.push(esc(subtitle));
  if (!items.length) lines.push("Ничего нет.");
  items.forEach((model, index) => {
    const variants = model.variants?.length ? ` · ${model.variants.map((v) => v.id).join("/")}` : "";
    const note = model.note ? " 📝" : "";
    lines.push(`${model.favorite ? "⭐" : "•"} <code>${esc(clip(model.id, 48))}</code>${esc(variants)}${note}`);
  });
  const rows = items.map((model, index) => [
    { text: `${index + 1}. ${clip(modelTitle(model), 26)}`, callback_data: `${prefix}:${index}` },
    { text: model.favorite ? "⭐" : "☆", callback_data: `fav:${index}` },
    { text: "🙈", callback_data: `hid:${index}` },
  ]);
  rows.push([
    { text: "⬅️", callback_data: `pg:${Math.max(0, page - 1)}` },
    { text: "➡️", callback_data: `pg:${page + 1}` },
  ]);
  rows.push([{ text: "⬅️ Назад", callback_data: back }]);
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function favoritesView({ items, page }) {
  const lines = [
    "<b>⭐ Избранное с заметками</b>",
    "Заметки хранятся в <code>data/favorites.json</code> и общие для всех ключей.",
  ];
  if (!items.length) lines.push("Пока пусто. Открой «Все модели» и нажми ☆.");
  items.forEach((model, index) => {
    lines.push(`${index + 1}. <b>${esc(modelTitle(model))}</b>`);
    if (model.note) lines.push(`   📝 ${esc(clip(model.note, 160))}`);
  });
  const rows = [];
  items.forEach((model, index) => {
    rows.push([{ text: `${index + 1}. ${clip(modelTitle(model), 36)}`, callback_data: `mm:${index}` }]);
    rows.push([
      { text: "📝 Заметка", callback_data: `fnote:${index}` },
      { text: "🙈 Скрыть", callback_data: `hid:${index}` },
      { text: "🗑 Убрать", callback_data: `funfav:${index}` },
    ]);
  });
  rows.push([
    { text: "⬅️", callback_data: `fpg:${Math.max(0, page - 1)}` },
    { text: "➡️", callback_data: `fpg:${page + 1}` },
  ]);
  rows.push([{ text: "📚 Все модели", callback_data: "mall" }]);
  rows.push([{ text: "⬅️ Модели", callback_data: "model" }]);
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function noteView({ model }) {
  return {
    text: [
      "<b>📝 Заметка к модели</b>",
      `<code>${esc(modelTitle(model))}</code>`,
      model.note ? `Сейчас: ${esc(clip(model.note, 500))}` : "Сейчас заметки нет.",
      "",
      "Отправь текст заметки. Чтобы очистить — отправь <code>-</code>.",
    ].join("\n"),
    keyboard: kb([
      [{ text: "🗑 Очистить", callback_data: `fclear:${model.index ?? 0}` }],
      [{ text: "⬅️ Избранное", callback_data: "mfav" }],
    ]),
  };
}

export function hiddenView({ items, page }) {
  const lines = ["<b>🙈 Скрытые модели</b>", "Скрытые не показываются в выборе. Нажми 👁, чтобы вернуть."];
  if (!items.length) lines.push("Скрытых моделей нет.");
  items.forEach((model) => {
    lines.push(`${model.hidden ? "🙈" : "👁"} <code>${esc(clip(model.id, 52))}</code>`);
  });
  const rows = items.map((model, index) => [
    { text: `${index + 1}. ${clip(modelTitle(model), 32)}`, callback_data: `hid:${index}` },
    { text: model.hidden ? "👁 Вернуть" : "🙈 Скрыть", callback_data: `hid:${index}` },
  ]);
  rows.push([
    { text: "⬅️", callback_data: `pg:${Math.max(0, page - 1)}` },
    { text: "➡️", callback_data: `pg:${page + 1}` },
  ]);
  rows.push([{ text: "⬅️ Модели", callback_data: "model" }]);
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function modelHomeView({ activeConnection, favoriteCount, favoriteAvailable, hiddenCount, visibleCount, totalCount }) {
  const lines = [
    "<b>🧠 Модель</b>",
    `Коннект: <b>${esc(activeConnection?.label ?? "не выбран")}</b>${activeConnection ? ` · <code>${esc(activeConnection.integrationID ?? "")}</code>` : ""}`,
    `Избранное: <b>${favoriteCount}</b>${favoriteCount !== favoriteAvailable ? ` · доступно здесь ${favoriteAvailable}` : ""} · скрыто: <b>${hiddenCount}</b>`,
    `Доступно: <b>${visibleCount}</b> из ${totalCount}`,
  ];
  const rows = [
    [{ text: `⭐ Избранное (${favoriteCount})`, callback_data: "mfav" }, { text: "📚 Все модели", callback_data: "mall" }],
    [{ text: `🔑 ${clip(activeConnection?.label ?? "Сменить коннект", 22)}`, callback_data: "cc:list" }, { text: `🙈 Скрытые (${hiddenCount})`, callback_data: "mhidden" }],
    home,
  ];
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function connectionPickerView({ items }) {
  const rows = items.map((credential, index) => [
    {
      text: `${credential.active ? "✅" : "🔑"} ${clip(credential.label, 34)}`,
      callback_data: `cc:${index}`,
    },
  ]);
  rows.push([{ text: "⬅️ Модели", callback_data: "model" }]);
  return {
    text: "<b>🔑 Коннект CommandCode</b>\nВыбери активный ключ. Избранное общее для всех ключей.",
    keyboard: kb(rows),
  };
}
