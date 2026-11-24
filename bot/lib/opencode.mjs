import { loadJson } from "./store.mjs";

const BASIC_USER = "opencode";
const PROBE_TIMEOUT_MS = 3000;

export class OpenCodeError extends Error {
  constructor(status, path, body) {
    super(`${status} ${path}: ${String(body).slice(0, 300)}`);
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

function basic(password) {
  return `Basic ${Buffer.from(`${BASIC_USER}:${password}`).toString("base64")}`;
}

async function probe(statePath) {
  const state = loadJson(statePath, null);
  if (!state?.url || !state?.password) throw new Error("service.json не найден");
  const response = await fetch(`${state.url}/api/info`, {
    headers: { authorization: basic(state.password) },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const info = await response.json();
  return { statePath, url: state.url, password: state.password, info };
}

export class ServiceManager {
  constructor(config, store) {
    this.config = config;
    this.store = store;
    this.cached = null;
  }

  async all() {
    const results = await Promise.allSettled(
      (this.config.serviceStates ?? []).map(async (path) => probe(path)),
    );
    return results.map((result, index) => {
      const path = this.config.serviceStates[index];
      return result.status === "fulfilled"
        ? { ok: true, path, ...result.value }
        : { ok: false, path, error: result.reason?.message || String(result.reason) };
    });
  }

  select(path) {
    this.store.data.servicePath = path;
    this.store.save();
    this.cached = null;
  }

  async client() {
    if (this.cached && Date.now() - this.cached.at < 10000) return this.cached.client;

    const selected = this.store.data.servicePath;
    if (selected) {
      try {
        const service = await probe(selected);
        return this.remember(service);
      } catch (error) {
        throw new Error(`Выбранный сервис недоступен: ${error.message}`);
      }
    }

    const candidates = await this.all();
    const service = candidates.find((item) => item.ok);
    if (!service) throw new Error("OpenCode не запущен: ни один service.json не отвечает");
    return this.remember(service);
  }

  remember(service) {
    const client = new OpenCodeClient(service);
    this.cached = { at: Date.now(), client };
    return client;
  }
}

export class OpenCodeClient {
  constructor(service) {
    this.service = service;
    this.url = service.url;
    this.password = service.password;
    this.info = service.info;
    this.statePath = service.statePath;
  }

  locationQuery(directory) {
    return directory ? `?location[directory]=${encodeURIComponent(directory)}` : "";
  }

  async request(method, path, body, timeoutMs = 45000) {
    let response;
    try {
      response = await fetch(this.url + path, {
        method,
        headers: {
          authorization: basic(this.password),
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new OpenCodeError(0, path, `сеть: ${error.message}`);
    }
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!response.ok) throw new OpenCodeError(response.status, path, text || response.statusText);
    return data;
  }

  async infoCall() {
    return (await this.request("GET", "/api/info")) ?? this.info;
  }

  async sessions(limit = 20, order = "desc") {
    const body = await this.request("GET", `/api/session?limit=${limit}&order=${order}`);
    return body?.data ?? [];
  }

  async session(id) {
    return (await this.request("GET", `/api/session/${id}`))?.data;
  }

  async active() {
    return (await this.request("GET", "/api/session/active"))?.data ?? {};
  }

  async stats() {
    return (await this.request("GET", "/api/experimental/session/stats"))?.data;
  }

  async messages(id, limit = 20, order = "desc") {
    const body = await this.request("GET", `/api/session/${id}/message?limit=${limit}&order=${order}`);
    return body?.data ?? [];
  }

  async models() {
    return (await this.request("GET", "/api/model"))?.data ?? [];
  }

  async agents() {
    return (await this.request("GET", "/api/agent"))?.data ?? [];
  }

  async providers() {
    return (await this.request("GET", "/api/provider"))?.data ?? [];
  }

  async credentials() {
    return (await this.request("GET", "/api/credential"))?.data ?? [];
  }

  async mcp(directory) {
    return (await this.request("GET", `/api/mcp${this.locationQuery(directory)}`))?.data ?? [];
  }

  async createSession({ title, directory, model, agent }) {
    const body = await this.request("POST", "/api/session", {
      title,
      location: { directory },
      ...(model ? { model } : {}),
      ...(agent ? { agent } : {}),
    });
    return body?.data;
  }

  async prompt(id, text, delivery = "queue") {
    return (await this.request("POST", `/api/session/${id}/prompt`, { text, delivery }, 90000))?.data;
  }

  async generate(id, prompt) {
    const body = await this.request("POST", `/api/session/${id}/generate`, { prompt }, 180000);
    return body?.data?.text ?? "";
  }

  async commands(directory) {
    return (await this.request("GET", `/api/command${this.locationQuery(directory)}`))?.data ?? [];
  }

  async setModel(id, model) {
    await this.request("POST", `/api/session/${id}/model`, { model });
  }

  async setAgent(id, agent) {
    await this.request("POST", `/api/session/${id}/agent`, { agent });
  }

  async rename(id, title) {
    await this.request("PATCH", `/api/session/${id}`, { title });
  }

  async move(id, directory, delivery = "steer") {
    await this.request("POST", `/api/session/${id}/move`, { directory, delivery });
  }

  async remove(id) {
    await this.request("DELETE", `/api/session/${id}`);
  }

  async interrupt(id) {
    await this.request("POST", `/api/session/${id}/interrupt`);
  }

  async diff(id) {
    return (await this.request("GET", `/api/session/${id}/diff`))?.data ?? [];
  }

  async activateCredential(id) {
    await this.request("POST", `/api/credential/${id}/activate`);
  }

  async mcpConnect(name, directory) {
    await this.request("POST", `/api/experimental/mcp/${encodeURIComponent(name)}/connect${this.locationQuery(directory)}`);
  }

  async mcpDisconnect(name, directory) {
    await this.request("POST", `/api/experimental/mcp/${encodeURIComponent(name)}/disconnect${this.locationQuery(directory)}`);
  }
}

export function friendlyError(error) {
  if (error instanceof OpenCodeError) {
    if (error.status === 401) return "OpenCode отклонил пароль сервиса. Проверь service.json.";
    if (error.status === 0) return `OpenCode недоступен: ${error.body}`;
    return `OpenCode ${error.status}: ${String(error.body).slice(0, 300)}`;
  }
  return String(error?.message || error);
}
