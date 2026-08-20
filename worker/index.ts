/// <reference types="@cloudflare/workers-types" />
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): { transform(options: Record<string, unknown>): { output(options: { format: string; quality: number }): Promise<{ response(): Response }> } };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const SESSION_SECONDS = 60 * 60;
const encoder = new TextEncoder();
const allowedSignals = new Set(["join-request", "guest-key", "accept", "reject", "offer", "answer", "ice", "leave"]);

function securityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' stun: turn: turns:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function json(data: unknown, status = 200) {
  return securityHeaders(new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  }));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function randomToken(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)));
}

function randomCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      code TEXT PRIMARY KEY,
      host_token_hash TEXT NOT NULL,
      guest_token_hash TEXT,
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_code TEXT NOT NULL,
      recipient TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_signals_session_recipient_id ON signals(session_code, recipient, id)"),
  ]);
}

async function parseBody(request: Request) {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > 70_000) throw new Error("Message too large");
  return await request.json() as Record<string, unknown>;
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function authenticate(db: D1Database, code: string, role: string, token: string) {
  if ((role !== "host" && role !== "guest") || !token || token.length > 100) return false;
  const row = await db.prepare("SELECT host_token_hash, guest_token_hash, expires_at FROM sessions WHERE code = ?")
    .bind(code).first<{ host_token_hash: string; guest_token_hash: string | null; expires_at: number }>();
  if (!row || row.expires_at <= Date.now()) return false;
  const expected = role === "host" ? row.host_token_hash : row.guest_token_hash;
  return Boolean(expected && expected === await hash(token));
}

async function api(request: Request, env: Env, ctx: ExecutionContext) {
  if (!sameOrigin(request)) return json({ error: "Untrusted origin" }, 403);
  await ensureSchema(env.DB);
  const url = new URL(request.url);
  const now = Date.now();
  ctx.waitUntil(env.DB.batch([
    env.DB.prepare("DELETE FROM signals WHERE created_at < ?").bind(now - SESSION_SECONDS * 1000),
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
  ]).then(() => undefined));

  if (url.pathname === "/api/sessions" && request.method === "POST") {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomCode();
      const token = randomToken();
      try {
        await env.DB.prepare("INSERT INTO sessions (code, host_token_hash, status, created_at, expires_at) VALUES (?, ?, 'waiting', ?, ?)")
          .bind(code, await hash(token), now, now + SESSION_SECONDS * 1000).run();
        return json({ code, token, expiresAt: now + SESSION_SECONDS * 1000 }, 201);
      } catch { /* retry an extremely unlikely code collision */ }
    }
    return json({ error: "Could not create a private room" }, 503);
  }

  const match = url.pathname.match(/^\/api\/sessions\/([A-Z0-9-]+)(?:\/(join|signals|close|ice))?$/u);
  if (!match) return json({ error: "Not found" }, 404);
  const code = match[1];
  const action = match[2];

  if (action === "join" && request.method === "POST") {
    const token = randomToken();
    const result = await env.DB.prepare("UPDATE sessions SET guest_token_hash = ?, status = 'pending' WHERE code = ? AND guest_token_hash IS NULL AND expires_at > ?")
      .bind(await hash(token), code, now).run();
    if (!result.meta.changes) return json({ error: "Room is unavailable, expired, or already has a guest" }, 409);
    await env.DB.prepare("INSERT INTO signals (session_code, recipient, type, payload, created_at) VALUES (?, 'host', 'join-request', '{}', ?)")
      .bind(code, now).run();
    return json({ code, token, expiresAt: now + SESSION_SECONDS * 1000 }, 201);
  }

  const role = url.searchParams.get("role") || "";
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!await authenticate(env.DB, code, role, token)) return json({ error: "Session expired or unauthorized" }, 401);

  if (action === "ice" && request.method === "GET") {
    const fallback = [{ urls: "stun:stun.cloudflare.com:3478" }];
    if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) return json({ iceServers: fallback, relayAvailable: false });
    try {
      const turnResponse = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { authorization: `Bearer ${env.TURN_API_TOKEN}`, "content-type": "application/json" },
        body: JSON.stringify({ ttl: 3600 }),
      });
      if (!turnResponse.ok) throw new Error("TURN credential service unavailable");
      const turn = await turnResponse.json() as { iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> };
      const iceServers = turn.iceServers.map((server) => ({
        ...server,
        urls: Array.isArray(server.urls) ? server.urls.filter((value) => !value.includes(":53")) : server.urls,
      }));
      return json({ iceServers, relayAvailable: true });
    } catch {
      return json({ iceServers: fallback, relayAvailable: false });
    }
  }

  if (action === "signals" && request.method === "GET") {
    const after = Math.max(0, Number(url.searchParams.get("after") || "0"));
    const result = await env.DB.prepare("SELECT id, type, payload, created_at FROM signals WHERE session_code = ? AND recipient = ? AND id > ? ORDER BY id ASC LIMIT 100")
      .bind(code, role, after).all();
    return json({ events: result.results.map((row: Record<string, unknown>) => ({ ...row, payload: JSON.parse(String(row.payload)) })) });
  }

  if (action === "signals" && request.method === "POST") {
    let body: Record<string, unknown>;
    try { body = await parseBody(request); } catch { return json({ error: "Invalid message" }, 400); }
    const type = String(body.type || "");
    const payload = body.payload ?? {};
    const serialized = JSON.stringify(payload);
    if (!allowedSignals.has(type) || serialized.length > 64_000) return json({ error: "Invalid signal" }, 400);
    const recipient = role === "host" ? "guest" : "host";
    await env.DB.prepare("INSERT INTO signals (session_code, recipient, type, payload, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(code, recipient, type, serialized, now).run();
    return json({ ok: true }, 202);
  }

  if (action === "close" && request.method === "POST") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM signals WHERE session_code = ?").bind(code),
      env.DB.prepare("DELETE FROM sessions WHERE code = ?").bind(code),
    ]);
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/sessions")) return api(request, env, ctx);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return securityHeaders(response);
    }

    return securityHeaders(await handler.fetch(request, env, ctx));
  },
};

export default worker;
