import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const SESSION_SECONDS = 60 * 60;
const allowedSignals = new Set(["join-request", "guest-key", "accept", "reject", "offer", "answer", "ice", "leave"]);

type Role = "host" | "guest";
type StoredSession = {
  hostTokenHash: string;
  guestTokenHash: string | null;
  status: "waiting" | "pending";
  createdAt: number;
  expiresAt: number;
};
type SignalEvent = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

let redisClient: Redis | null = null;
let createRateLimit: Ratelimit | null = null;
let joinRateLimit: Ratelimit | null = null;

function redis() {
  if (redisClient) return redisClient;
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis environment variables are not configured");
  redisClient = new Redis({ url, token, automaticDeserialization: true });
  return redisClient;
}

function limiter(action: "create" | "join") {
  if (action === "create") {
    createRateLimit ??= new Ratelimit({
      redis: redis(),
      limiter: Ratelimit.slidingWindow(20, "1 m"),
      prefix: "cipherdrop:rate:create",
      analytics: false,
    });
    return createRateLimit;
  }
  joinRateLimit ??= new Ratelimit({
    redis: redis(),
    limiter: Ratelimit.slidingWindow(40, "1 m"),
    prefix: "cipherdrop:rate:join",
    analytics: false,
  });
  return joinRateLimit;
}

function sessionKey(code: string) {
  return `cipherdrop:session:${code}`;
}

function signalKey(code: string, recipient: Role) {
  return `cipherdrop:signals:${code}:${recipient}`;
}

function sequenceKey(code: string) {
  return `cipherdrop:sequence:${code}`;
}

function randomToken(size = 32) {
  return randomBytes(size).toString("base64url");
}

function randomCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(10);
  const raw = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

function equalHash(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function fingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return hash(`cipherdrop-anonymous-v2|${forwarded || "local"}`);
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store, max-age=0" },
  });
}

async function pushSignal(code: string, recipient: Role, type: string, payload: Record<string, unknown>) {
  const database = redis();
  const id = await database.incr(sequenceKey(code));
  const event: SignalEvent = { id, type, payload, createdAt: Date.now() };
  const pipeline = database.pipeline();
  pipeline.rpush(signalKey(code, recipient), event);
  pipeline.ltrim(signalKey(code, recipient), -200, -1);
  pipeline.expire(signalKey(code, recipient), SESSION_SECONDS);
  pipeline.expire(sequenceKey(code), SESSION_SECONDS);
  await pipeline.exec();
}

async function authenticate(code: string, role: Role, token: string) {
  if (!token || token.length > 100) return false;
  const session = await redis().get<StoredSession>(sessionKey(code));
  if (!session || session.expiresAt <= Date.now()) return false;
  const expected = role === "host" ? session.hostTokenHash : session.guestTokenHash;
  return Boolean(expected && equalHash(expected, hash(token)));
}

export async function createSession(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Untrusted origin" }, 403);
  const rate = await limiter("create").limit(fingerprint(request));
  if (!rate.success) return json({ error: "Too many rooms created. Please wait a minute." }, 429);

  const now = Date.now();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const token = randomToken();
    const session: StoredSession = {
      hostTokenHash: hash(token),
      guestTokenHash: null,
      status: "waiting",
      createdAt: now,
      expiresAt: now + SESSION_SECONDS * 1000,
    };
    const created = await redis().set(sessionKey(code), session, { nx: true, ex: SESSION_SECONDS });
    if (created) return json({ code, token, expiresAt: session.expiresAt }, 201);
  }
  return json({ error: "Could not create a private room" }, 503);
}

export async function handleSessionAction(request: Request, rawCode: string, action: string) {
  if (!sameOrigin(request)) return json({ error: "Untrusted origin" }, 403);
  const code = rawCode.toUpperCase();
  if (!/^[A-Z2-9]{5}-[A-Z2-9]{5}$/u.test(code)) return json({ error: "Invalid room code" }, 400);

  if (action === "join" && request.method === "POST") {
    const rate = await limiter("join").limit(fingerprint(request));
    if (!rate.success) return json({ error: "Too many connection attempts. Please wait a minute." }, 429);
    const token = randomToken();
    const script = `
      local raw = redis.call("GET", KEYS[1])
      if not raw then return 0 end
      local session = cjson.decode(raw)
      if session.guestTokenHash ~= cjson.null then return 0 end
      session.guestTokenHash = ARGV[1]
      session.status = "pending"
      redis.call("SET", KEYS[1], cjson.encode(session), "KEEPTTL")
      return 1
    `;
    const joined = Number(await redis().eval(script, [sessionKey(code)], [hash(token)]));
    if (!joined) return json({ error: "Room is unavailable, expired, or already has a guest" }, 409);
    await pushSignal(code, "host", "join-request", {});
    const session = await redis().get<StoredSession>(sessionKey(code));
    return json({ code, token, expiresAt: session?.expiresAt ?? Date.now() + SESSION_SECONDS * 1000 }, 201);
  }

  const roleValue = new URL(request.url).searchParams.get("role");
  if (roleValue !== "host" && roleValue !== "guest") return json({ error: "Invalid role" }, 400);
  const role: Role = roleValue;
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!await authenticate(code, role, token)) return json({ error: "Session expired or unauthorized" }, 401);

  if (action === "ice" && request.method === "GET") {
    const fallback = [{ urls: "stun:stun.cloudflare.com:3478" }];
    if (!process.env.TURN_KEY_ID || !process.env.TURN_API_TOKEN) {
      return json({ iceServers: fallback, relayAvailable: false });
    }
    try {
      const turnResponse = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${process.env.TURN_KEY_ID}/credentials/generate-ice-servers`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${process.env.TURN_API_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ ttl: SESSION_SECONDS }),
          cache: "no-store",
        },
      );
      if (!turnResponse.ok) throw new Error("TURN credential service unavailable");
      const turn = await turnResponse.json() as {
        iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
      };
      return json({ iceServers: turn.iceServers, relayAvailable: true });
    } catch {
      return json({ iceServers: fallback, relayAvailable: false });
    }
  }

  if (action === "signals" && request.method === "GET") {
    const after = Math.max(0, Number(new URL(request.url).searchParams.get("after") || "0"));
    const events = await redis().lrange<SignalEvent>(signalKey(code, role), 0, -1);
    return json({ events: events.filter((event) => event.id > after).slice(0, 100) });
  }

  if (action === "signals" && request.method === "POST") {
    const raw = await request.text();
    if (raw.length > 64_000) return json({ error: "Message too large" }, 413);
    let body: { type?: unknown; payload?: unknown };
    try {
      body = JSON.parse(raw) as { type?: unknown; payload?: unknown };
    } catch {
      return json({ error: "Invalid message" }, 400);
    }
    const type = String(body.type || "");
    const payload = body.payload && typeof body.payload === "object"
      ? body.payload as Record<string, unknown>
      : {};
    if (!allowedSignals.has(type) || JSON.stringify(payload).length > 60_000) {
      return json({ error: "Invalid signal" }, 400);
    }
    await pushSignal(code, role === "host" ? "guest" : "host", type, payload);
    return json({ ok: true }, 202);
  }

  if (action === "close" && request.method === "POST") {
    await redis().del(
      sessionKey(code),
      signalKey(code, "host"),
      signalKey(code, "guest"),
      sequenceKey(code),
    );
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}
