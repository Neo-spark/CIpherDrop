import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { config as loadEnvironment } from "dotenv";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { isTransferDirection, validateSignalPayload } from "./validation.js";

loadEnvironment({ path: ["../.env.local", ".env.local", ".env"] });

const SESSION_SECONDS = 60 * 60;
const frontendOrigins = new Set(
  (process.env.FRONTEND_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((value) => value.trim().replace(/\/$/u, ""))
    .filter(Boolean),
);

type Role = "host" | "guest";
type TransferDirection = "host-to-guest" | "guest-to-host";
type StoredSession = {
  hostTokenHash: string;
  guestTokenHash: string | null;
  status: "waiting" | "pending";
  direction: TransferDirection;
  createdAt: number;
  expiresAt: number;
};
type SignalEvent = {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
};

function createRedis() {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN are required");
  return new Redis({ url, token, automaticDeserialization: true });
}

const redis = createRedis();
const createRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  prefix: "cipherdrop:rate:create",
  analytics: false,
});
const joinRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(40, "1 m"),
  prefix: "cipherdrop:rate:join",
  analytics: false,
});
const signalReadTokenRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(150, "1 m"),
  prefix: "cipherdrop:rate:signal-read-token",
  analytics: false,
});
const signalReadIpRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(600, "1 m"),
  prefix: "cipherdrop:rate:signal-read-ip",
  analytics: false,
});
const signalWriteTokenRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(90, "1 m"),
  prefix: "cipherdrop:rate:signal-write-token",
  analytics: false,
});
const signalWriteIpRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(300, "1 m"),
  prefix: "cipherdrop:rate:signal-write-ip",
  analytics: false,
});
const iceTokenRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(12, "10 m"),
  prefix: "cipherdrop:rate:ice-token",
  analytics: false,
});
const iceIpRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "10 m"),
  prefix: "cipherdrop:rate:ice-ip",
  analytics: false,
});

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
  return hash(`cipherdrop-anonymous-v3|${request.ip || "unknown"}`);
}

function sendJson(response: Response, data: unknown, status = 200) {
  response.status(status).set("Cache-Control", "no-store, max-age=0").json(data);
}

async function enforceAuthenticatedLimit(
  request: Request,
  response: Response,
  tokenLimiter: Ratelimit,
  ipLimiter: Ratelimit,
  message: string,
) {
  const code = response.locals.code as string;
  const role = response.locals.role as Role;
  const tokenHash = response.locals.tokenHash as string;
  const [tokenResult, ipResult] = await Promise.all([
    tokenLimiter.limit(`${code}:${role}:${tokenHash}`),
    ipLimiter.limit(fingerprint(request)),
  ]);
  const denied = !tokenResult.success ? tokenResult : !ipResult.success ? ipResult : null;
  if (!denied) return true;
  response.set("Retry-After", String(Math.max(1, Math.ceil((denied.reset - Date.now()) / 1_000))));
  sendJson(response, { error: message }, 429);
  return false;
}

function roleFrom(request: Request): Role | null {
  return request.query.role === "host" || request.query.role === "guest" ? request.query.role : null;
}

async function pushSignal(code: string, recipient: Role, type: string, payload: Record<string, unknown>) {
  const id = await redis.incr(sequenceKey(code));
  const event: SignalEvent = { id, type, payload, createdAt: Date.now() };
  const pipeline = redis.pipeline();
  pipeline.rpush(signalKey(code, recipient), event);
  pipeline.ltrim(signalKey(code, recipient), -200, -1);
  pipeline.expire(signalKey(code, recipient), SESSION_SECONDS);
  pipeline.expire(sequenceKey(code), SESSION_SECONDS);
  await pipeline.exec();
}

async function authenticate(code: string, role: Role, token: string) {
  if (!token || token.length > 100) return false;
  const session = await redis.get<StoredSession>(sessionKey(code));
  if (!session || session.expiresAt <= Date.now()) return false;
  const expected = role === "host" ? session.hostTokenHash : session.guestTokenHash;
  return Boolean(expected && equalHash(expected, hash(token)));
}

async function requireSession(request: Request, response: Response, next: NextFunction) {
  const code = String(request.params.code || "").toUpperCase();
  const role = roleFrom(request);
  const authorization = request.header("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!role || !await authenticate(code, role, token)) {
    sendJson(response, { error: "Session expired or unauthorized" }, 401);
    return;
  }
  response.locals.code = code;
  response.locals.role = role;
  response.locals.tokenHash = hash(token);
  next();
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || frontendOrigins.has(origin.replace(/\/$/u, ""))) callback(null, true);
    else callback(new Error("Origin is not allowed"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  maxAge: 86400,
}));
app.use(express.json({ limit: "70kb", strict: true }));

app.get("/health", (_request, response) => {
  sendJson(response, { status: "ok" });
});

app.post("/api/sessions", async (request, response, next) => {
  try {
    const direction = request.body?.direction;
    if (!isTransferDirection(direction)) {
      sendJson(response, { error: "Choose whether this device will send or receive" }, 400);
      return;
    }
    const rate = await createRateLimit.limit(fingerprint(request));
    if (!rate.success) {
      sendJson(response, { error: "Too many rooms created. Please wait a minute." }, 429);
      return;
    }
    const now = Date.now();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = randomCode();
      const token = randomToken();
      const session: StoredSession = {
        hostTokenHash: hash(token),
        guestTokenHash: null,
        status: "waiting",
        direction,
        createdAt: now,
        expiresAt: now + SESSION_SECONDS * 1000,
      };
      const created = await redis.set(sessionKey(code), session, { nx: true, ex: SESSION_SECONDS });
      if (created) {
        sendJson(response, { code, token, direction, expiresAt: session.expiresAt }, 201);
        return;
      }
    }
    sendJson(response, { error: "Could not create a private room" }, 503);
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/:code/join", async (request, response, next) => {
  try {
    const code = String(request.params.code || "").toUpperCase();
    if (!/^[A-Z2-9]{5}-[A-Z2-9]{5}$/u.test(code)) {
      sendJson(response, { error: "Invalid room code" }, 400);
      return;
    }
    const rate = await joinRateLimit.limit(fingerprint(request));
    if (!rate.success) {
      sendJson(response, { error: "Too many connection attempts. Please wait a minute." }, 429);
      return;
    }
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
    const joined = Number(await redis.eval(script, [sessionKey(code)], [hash(token)]));
    if (!joined) {
      sendJson(response, { error: "Room is unavailable, expired, or already has a guest" }, 409);
      return;
    }
    await pushSignal(code, "host", "join-request", {});
    const session = await redis.get<StoredSession>(sessionKey(code));
    if (!session || !isTransferDirection(session.direction)) {
      sendJson(response, { error: "Room direction is unavailable" }, 409);
      return;
    }
    sendJson(response, { code, token, direction: session.direction, expiresAt: session.expiresAt }, 201);
  } catch (error) {
    next(error);
  }
});

app.get("/api/sessions/:code/ice", requireSession, async (request, response, next) => {
  try {
    if (!await enforceAuthenticatedLimit(request, response, iceTokenRateLimit, iceIpRateLimit, "Too many relay credential requests")) return;
  } catch (error) {
    next(error);
    return;
  }
  const fallback = [{ urls: "stun:stun.cloudflare.com:3478" }];
  if (!process.env.TURN_KEY_ID || !process.env.TURN_API_TOKEN) {
    sendJson(response, { iceServers: fallback, relayAvailable: false });
    return;
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
      },
    );
    if (!turnResponse.ok) throw new Error("TURN credential service unavailable");
    const turn = await turnResponse.json() as {
      iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
    };
    sendJson(response, { iceServers: turn.iceServers, relayAvailable: true });
  } catch {
    sendJson(response, { iceServers: fallback, relayAvailable: false });
  }
});

app.get("/api/sessions/:code/signals", requireSession, async (request, response, next) => {
  try {
    if (!await enforceAuthenticatedLimit(request, response, signalReadTokenRateLimit, signalReadIpRateLimit, "Signaling is being polled too quickly")) return;
    const code = response.locals.code as string;
    const role = response.locals.role as Role;
    const after = Math.max(0, Number(request.query.after || "0"));
    const events = await redis.lrange<SignalEvent>(signalKey(code, role), 0, -1);
    sendJson(response, { events: events.filter((event) => event.id > after).slice(0, 100) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/:code/signals", requireSession, async (request, response, next) => {
  try {
    if (!await enforceAuthenticatedLimit(request, response, signalWriteTokenRateLimit, signalWriteIpRateLimit, "Too many signaling messages")) return;
    const code = response.locals.code as string;
    const role = response.locals.role as Role;
    const type = String(request.body?.type || "");
    const payload = request.body?.payload;
    if (!validateSignalPayload(type, payload)) {
      sendJson(response, { error: "Invalid signal" }, 400);
      return;
    }
    await pushSignal(code, role === "host" ? "guest" : "host", type, payload);
    sendJson(response, { ok: true }, 202);
  } catch (error) {
    next(error);
  }
});

app.post("/api/sessions/:code/close", requireSession, async (_request, response, next) => {
  try {
    const code = response.locals.code as string;
    await redis.del(
      sessionKey(code),
      signalKey(code, "host"),
      signalKey(code, "guest"),
      sequenceKey(code),
    );
    sendJson(response, { ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((_request, response) => {
  sendJson(response, { error: "Not found" }, 404);
});

app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
  void _next;
  if (error.message === "Origin is not allowed") {
    sendJson(response, { error: "Untrusted origin" }, 403);
    return;
  }
  console.error(error);
  sendJson(response, { error: "The signaling service encountered an error" }, 500);
});

const port = Number(process.env.PORT || 4000);
app.listen(port, "0.0.0.0", () => {
  console.log(`CipherDrop API listening on port ${port}`);
});
