import { chunks, sleep } from "./format.mjs";

export class Telegram {
  constructor(token) {
    this.base = `https://api.telegram.org/bot${token}`;
  }

  async call(method, payload = {}, timeoutMs = 45000) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(`${this.base}/${method}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await response.json().catch(() => ({}));
        if (response.ok) return body.result;
        if (response.status === 429) {
          await sleep((body.parameters?.retry_after ?? 2) * 1000);
          continue;
        }
        throw new Error(`${method}: ${body.description || response.status}`);
      } catch (error) {
        lastError = error;
        if (attempt < 2) await sleep(1500);
      }
    }
    throw lastError;
  }

  async getUpdates(offset) {
    return this.call(
      "getUpdates",
      { offset, timeout: 25, allowed_updates: ["message", "callback_query"] },
      40000,
    );
  }

  async send(chatId, text, keyboard) {
    let last;
    for (const part of chunks(text || "(пусто)")) {
      last = await this.call("sendMessage", {
        chat_id: chatId,
        text: part,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      });
    }
    return last?.message_id;
  }

  async edit(chatId, messageId, text, keyboard) {
    const parts = chunks(text || "(пусто)");
    try {
      const result = await this.call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: parts[0],
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(keyboard ? { reply_markup: keyboard } : {}),
      });
      for (const part of parts.slice(1)) await this.send(chatId, part);
      return result?.message_id ?? messageId;
    } catch (error) {
      if (String(error.message).includes("message is not modified")) return messageId;
      if (String(error.message).includes("message to edit not found")) {
        return this.send(chatId, text, keyboard);
      }
      throw error;
    }
  }

  async answerCallback(id, text) {
    try {
      await this.call("answerCallbackQuery", { callback_query_id: id, text: text || undefined });
    } catch {}
  }

  async typing(chatId) {
    this.call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  }

  async setCommands(commands) {
    await this.call("setMyCommands", { commands });
  }

  async getMe() {
    return this.call("getMe");
  }
}
