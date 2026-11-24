export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function clip(value, max) {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function chunks(value, max = 3600) {
  const text = String(value ?? "");
  if (text.length <= max) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max * 0.5) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) parts.push(rest);
  return parts;
}

export function fmtDate(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDuration(ms) {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec} с`;
  const min = Math.floor(sec / 60);
  return `${min} мин ${sec % 60} с`;
}

export function fmtCost(value) {
  const n = Number(value) || 0;
  return `$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`;
}

export function fmtTokens(value) {
  const n = Number(value) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function modelLabel(model) {
  if (!model) return "—";
  const variant = model.variant ? ` · ${model.variant}` : "";
  return `${model.providerID}/${model.id}${variant}`;
}

export function modelTitle(model) {
  return clip(model?.name || model?.id || "model", 42);
}

export function assistantView(message) {
  const parts = Array.isArray(message?.content) ? message.content : [];
  const text = parts
    .filter((part) => part?.type === "text")
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n\n")
    .trim();
  const reasoning = parts
    .filter((part) => part?.type === "reasoning")
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();
  const tools = parts
    .filter((part) => part?.type === "tool")
    .map((part) => ({ name: part.name || "tool", status: part.state?.status || "unknown" }));
  return { text, reasoning, tools };
}

export function sessionTitle(session) {
  return clip(session?.title || session?.id || "сессия", 48);
}

export function sessionState(session, activeMap) {
  if (activeMap?.[session?.id]) return "🟠 работает";
  return "🟢 idle";
}

export function oneLine(value, max = 100) {
  return clip(String(value ?? "").replace(/\s+/g, " ").trim(), max);
}
