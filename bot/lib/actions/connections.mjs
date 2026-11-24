import { connectionsView } from "../ui.mjs";
import { esc } from "../format.mjs";
import { client, chatOf, sendView } from "./shared.mjs";

export async function openConnections(ctx, chatId, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const [providers, credentials, mcp, models] = await Promise.all([
    oc.providers(),
    oc.credentials(),
    oc.mcp(chat.activeSession ? undefined : ctx.config.defaultDirectory).catch(() => []),
    oc.models(),
  ]);
  const counts = {};
  for (const model of models) counts[model.providerID] = (counts[model.providerID] || 0) + 1;
  chat.menu = { kind: "connections", credentials, mcp };
  ctx.store.save();
  await sendView(ctx, chatId, connectionsView({ providers, credentials, mcp, counts }), editId);
}

export async function activateCredential(ctx, chatId, index, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const credential = chatOf(ctx, chatId).menu?.credentials?.[index];
  if (!credential) return openConnections(ctx, chatId, editId);
  try {
    await oc.activateCredential(credential.id);
    await ctx.tg.send(chatId, `🔑 Активен: <b>${esc(credential.label)}</b>`);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
  await openConnections(ctx, chatId, editId);
}

export async function toggleMcp(ctx, chatId, index, editId) {
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const chat = chatOf(ctx, chatId);
  const server = chat.menu?.mcp?.[index];
  if (!server) return openConnections(ctx, chatId, editId);
  const connected = server.status?.status === "connected";
  const directory = ctx.config.defaultDirectory;
  try {
    if (connected) await oc.mcpDisconnect(server.name, directory);
    else await oc.mcpConnect(server.name, directory);
    await ctx.tg.send(chatId, `${connected ? "🔌 Отключён" : "🔗 Подключён"}: <b>${esc(server.name)}</b>`);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ ${esc(friendlyError(error))}`);
  }
  await openConnections(ctx, chatId, editId);
}
