import { finishView, liveView } from "./ui.mjs";

export class Presence {
  constructor(ctx) {
    this.ctx = ctx;
    this.timer = null;
    this.chatId = null;
    this.busy = false;
  }

  start(chatId) {
    if (chatId) this.chatId = String(chatId);
    if (this.timer) {
      if (this.chatId) this.chatId = String(this.chatId);
      return;
    }
    const interval = this.ctx.config.presenceIntervalMs ?? 8000;
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
    void this.tick(true);
  }

  async refresh(chatId) {
    if (chatId) this.chatId = String(chatId);
    if (!this.timer) this.start(this.chatId);
    await this.tick(false, true);
  }

  async tick(initial = false, forceLive = false) {
    if (this.busy) return;
    this.busy = true;
    try {
      const store = this.ctx.store;
      const state = store.data;
      const chatId = this.chatId || state.live?.chatId || Object.keys(state.chats)[0];
      if (!chatId) return;
      const oc = await this.ctx.service.client();
      const [active, sessions] = await Promise.all([oc.active(), oc.sessions(40)]);
      const monitor = state.monitor.sessions;
      const activeIds = new Set(Object.keys(active));

      for (const session of sessions) {
        const previous = monitor[session.id];
        const running = activeIds.has(session.id);
        if (!previous) {
          monitor[session.id] = { running, updated: session.time?.updated ?? 0, outcome: session.outcome ?? null };
          continue;
        }
        if (!initial && previous.running && !running && !this.ctx.activePrompts?.has(session.id)) {
          const reportedAt = this.ctx.lastPromptReports?.[session.id] ?? 0;
          if (Date.now() - reportedAt > 60000) await this.notify(oc, session, chatId);
        }
        previous.running = running;
        previous.updated = session.time?.updated ?? previous.updated;
        previous.outcome = session.outcome ?? previous.outcome;
      }

      for (const id of Object.keys(monitor)) {
        if (!sessions.some((session) => session.id === id)) delete monitor[id];
      }

      const now = Date.now();
      const live = state.live;
      const shouldLive = initial || forceLive || now - (live.updatedAt ?? 0) > (this.ctx.config.liveIntervalMs ?? 20000);
      if (shouldLive) {
        const activeSessions = sessions.filter((session) => activeIds.has(session.id));
        await this.renderLive(chatId, liveView({ activeSessions, sessions, now }));
        live.updatedAt = now;
      }
      store.save();
    } catch (error) {
      this.ctx.log?.(`presence: ${error?.message || error}`);
    } finally {
      this.busy = false;
    }
  }

  async renderLive(chatId, view) {
    const live = this.ctx.store.data.live;
    if (live.chatId !== chatId) {
      live.chatId = chatId;
      live.messageId = null;
      live.pinned = false;
    }
    if (live.messageId) {
      try {
        await this.ctx.tg.edit(chatId, live.messageId, view.text, view.keyboard);
        return;
      } catch {
        live.messageId = null;
        live.pinned = false;
      }
    }
    live.messageId = await this.ctx.tg.send(chatId, view.text, view.keyboard);
    if (!live.pinned) {
      try {
        await this.ctx.tg.pinChatMessage(chatId, live.messageId);
        live.pinned = true;
      } catch (error) {
        this.ctx.log?.(`pin failed: ${error?.message || error}`);
      }
    }
  }

  async notify(oc, session, chatId) {
    try {
      const messages = await oc.messages(session.id, 10, "desc").catch(() => []);
      const view = finishView({ session, messages });
      await this.ctx.tg.send(chatId, view.text, view.keyboard);
      this.ctx.store.data.monitor.sessions[session.id].notifiedAt = Date.now();
      this.ctx.lastPromptReports ??= {};
      this.ctx.lastPromptReports[session.id] = Date.now();
    } catch (error) {
      this.ctx.log?.(`finish notify failed: ${error?.message || error}`);
    }
  }
}
