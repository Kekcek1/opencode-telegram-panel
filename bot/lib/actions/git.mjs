import { existsSync } from "node:fs";
import { gitLogView, gitReposView, gitView } from "../ui.mjs";
import { branches, commitAll, history, pull, push, repoInfo } from "../git.mjs";
import { clip, esc } from "../format.mjs";
import { client, chatOf, currentSession, sendView } from "./shared.mjs";

async function gitContext(ctx, chatId) {
  const oc = await client(ctx, chatId);
  if (!oc) return null;
  const chat = chatOf(ctx, chatId);
  const session = await currentSession(ctx, chat).catch(() => null);
  const cwd = chat.gitCwd || session?.location?.directory || ctx.config.defaultDirectory;
  const info = await repoInfo(ctx.config, cwd);
  return { oc, chat, cwd, info };
}

export async function openGitRepos(ctx, chatId, editId) {
  const chat = chatOf(ctx, chatId);
  const session = await currentSession(ctx, chat).catch(() => null);
  const items = [
    ...new Set([
      ...(ctx.config.repos || []),
      chat.gitCwd,
      session?.location?.directory,
      ctx.config.defaultDirectory,
    ].filter(Boolean)),
  ].filter((path) => existsSync(path));
  chat.menu = { kind: "git-repos", repos: items };
  ctx.store.save();
  await sendView(ctx, chatId, gitReposView({ items, current: chat.gitCwd }), editId);
}

export async function selectGitRepo(ctx, chatId, index, editId) {
  const chat = chatOf(ctx, chatId);
  const path = chat.menu?.repos?.[index];
  if (!path) return openGitRepos(ctx, chatId, editId);
  chat.gitCwd = path;
  ctx.store.save();
  await openGit(ctx, chatId, editId);
}

export async function openGit(ctx, chatId, editId) {
  const data = await gitContext(ctx, chatId);
  if (!data) return;
  data.chat.menu = { kind: "git", cwd: data.cwd };
  ctx.store.save();
  await sendView(ctx, chatId, gitView({ info: data.info, cwd: data.cwd }), editId);
}

export async function gitAction(ctx, chatId, action, editId) {
  const data = await gitContext(ctx, chatId);
  if (!data) return;
  const { cwd, info } = data;
  if (!info.repo) {
    await ctx.tg.send(chatId, `🌿 Это не git-репозиторий:\n<code>${esc(cwd)}</code>`);
    return;
  }
  try {
    if (action === "push") {
      await ctx.tg.send(chatId, "🚀 Отправляю…");
      const out = await push(ctx.config, cwd);
      await ctx.tg.send(chatId, `✅ Push\n<code>${esc(clip(out, 1500))}</code>`);
      return openGit(ctx, chatId, editId);
    }
    if (action === "pull") {
      const out = await pull(ctx.config, cwd);
      await ctx.tg.send(chatId, `✅ Pull\n<code>${esc(clip(out, 1500))}</code>`);
      return openGit(ctx, chatId, editId);
    }
    if (action === "log") {
      const out = await history(ctx.config, cwd, 12);
      return sendView(ctx, chatId, gitLogView({ title: "История", text: out }), editId);
    }
    if (action === "branches") {
      const out = await branches(ctx.config, cwd);
      return sendView(ctx, chatId, gitLogView({ title: "Ветки", text: out }), editId);
    }
  } catch (error) {
    await ctx.tg.send(chatId, `❌ Git: ${esc(clip(error.message, 1800))}`);
  }
}

export async function startGitCommit(ctx, chatId, editId) {
  const data = await gitContext(ctx, chatId);
  if (!data) return;
  if (!data.info.repo) {
    await ctx.tg.send(chatId, `🌿 Это не git-репозиторий:\n<code>${esc(data.cwd)}</code>`);
    return;
  }
  const chat = chatOf(ctx, chatId);
  chat.mode = "git-commit";
  chat.menu = { kind: "git", cwd: data.cwd };
  ctx.store.save();
  await ctx.tg.send(chatId, "💾 Отправь сообщение коммита. Секреты и `.env` будут заблокированы.");
}

export async function finishGitCommit(ctx, chatId, message) {
  const chat = chatOf(ctx, chatId);
  const cwd = chat.menu?.cwd;
  chat.mode = null;
  ctx.store.save();
  if (!cwd) return showMain(ctx, chatId);
  try {
    const out = await commitAll(ctx.config, cwd, message);
    await ctx.tg.send(chatId, `💾 ${esc(clip(out, 1800))}`);
    await openGit(ctx, chatId);
  } catch (error) {
    await ctx.tg.send(chatId, `❌ Git: ${esc(clip(error.message, 1800))}`);
  }
}
