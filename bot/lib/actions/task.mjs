import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { esc, fmtDate } from "../format.mjs";
import { modelRef } from "../prefs.mjs";
import { runPrompt } from "../prompt.mjs";
import { client, chatOf } from "./shared.mjs";

export async function quickTask(ctx, chatId, text) {
  const chat = chatOf(ctx, chatId);
  if (chat.activeSession) {
    await runPrompt(ctx, chatId, text);
    return;
  }
  const oc = await client(ctx, chatId);
  if (!oc) return;
  const models = await oc.models();
  const found =
    models.find((item) => item.providerID === ctx.config.defaultModel.providerID && item.id === ctx.config.defaultModel.id) ||
    models.find((item) => item.enabled);
  const model = found ? modelRef(found) : ctx.config.defaultModel;
  const agent = ctx.config.defaultAgent || "build";
  const root = ctx.config.sessionRoot || "G:\\sessions";
  const session = await oc.createSession({
    title: `TG task · ${fmtDate(Date.now())}`,
    directory: root,
    model,
    agent,
  });
  const directory = join(root, session.id);
  mkdirSync(directory, { recursive: true });
  await oc.move(session.id, directory, "steer").catch((error) => ctx.log?.(`move failed: ${error.message}`));
  chat.activeSession = session.id;
  ctx.store.save();
  await ctx.tg.send(chatId, `✅ Задача создана в <b>${esc(session.title)}</b>\n📁 <code>${esc(directory)}</code>`);
  await runPrompt(ctx, chatId, text);
}
