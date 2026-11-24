import { clip, esc, modelTitle } from "./format.mjs";

const kb = (rows) => ({ inline_keyboard: rows.filter((row) => row.length) });
const home = [{ text: "🏠 Меню", callback_data: "home" }];

export function modelsView({ items, page, prefix, title, subtitle, back = "home" }) {
  const lines = [`<b>${esc(title)}</b>`];
  if (subtitle) lines.push(esc(subtitle));
  if (!items.length) lines.push("Ничего нет.");
  items.forEach((model, index) => {
    const variants = model.variants?.length ? ` · ${model.variants.map((v) => v.id).join("/")}` : "";
    lines.push(`${model.favorite ? "⭐" : "•"} <code>${esc(clip(model.id, 48))}</code>${esc(variants)}`);
  });
  const rows = items.map((model, index) => [
    { text: `${index + 1}. ${clip(modelTitle(model), 34)}`, callback_data: `${prefix}:${index}` },
    { text: model.favorite ? "⭐" : "☆", callback_data: `fav:${index}` },
  ]);
  rows.push([
    { text: "⬅️", callback_data: `pg:${Math.max(0, page - 1)}` },
    { text: "➡️", callback_data: `pg:${page + 1}` },
  ]);
  rows.push([{ text: "⬅️ Назад", callback_data: back }]);
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function hiddenView({ items, page }) {
  const lines = ["<b>🙈 Скрытые модели</b>", "Скрытые не показываются в выборе. Нажми 👁, чтобы вернуть."];
  if (!items.length) lines.push("Скрытых моделей нет.");
  items.forEach((model, index) => {
    lines.push(`${model.hidden ? "🙈" : "👁"} <code>${esc(clip(model.id, 52))}</code>`);
  });
  const rows = items.map((model, index) => [
    { text: `${index + 1}. ${clip(modelTitle(model), 34)}`, callback_data: `hid:${index}` },
    { text: model.hidden ? "👁" : "🙈", callback_data: `hid:${index}` },
  ]);
  rows.push([
    { text: "⬅️", callback_data: `pg:${Math.max(0, page - 1)}` },
    { text: "➡️", callback_data: `pg:${page + 1}` },
  ]);
  rows.push([{ text: "⬅️ Модели", callback_data: "model" }]);
  return { text: lines.join("\n"), keyboard: kb(rows) };
}

export function modelHomeView({ activeConnection, favoriteCount, hiddenCount, visibleCount, totalCount }) {
  const lines = [
    "<b>🧠 Модель</b>",
    `Коннект: <b>${esc(activeConnection?.label ?? "не выбран")}</b>${activeConnection ? ` · <code>${esc(activeConnection.integrationID ?? "")}</code>` : ""}`,
    `Избранное: <b>${favoriteCount}</b> · скрыто: <b>${hiddenCount}</b>`,
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
