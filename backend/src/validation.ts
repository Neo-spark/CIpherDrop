export const allowedSignals = new Set([
  "join-request",
  "guest-key",
  "accept",
  "reject",
  "offer",
  "answer",
  "ice",
  "leave",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isBase64Url(value: unknown, exactLength: number) {
  return typeof value === "string"
    && value.length === exactLength
    && /^[A-Za-z0-9_-]+$/u.test(value);
}

function isOptionalString(value: unknown, maxLength: number) {
  return value === null || value === undefined
    || (typeof value === "string" && value.length <= maxLength);
}

export function validateSignalPayload(type: string, payload: unknown): payload is Record<string, unknown> {
  if (!allowedSignals.has(type) || !isRecord(payload)) return false;
  if (JSON.stringify(payload).length > 60_000) return false;

  if (type === "join-request" || type === "reject" || type === "leave") {
    return Object.keys(payload).length === 0;
  }

  if (type === "guest-key") {
    return isBase64Url(payload.publicKey, 87)
      && isBase64Url(payload.mac, 43)
      && (payload.mode === "code" || payload.mode === "link");
  }

  if (type === "accept") {
    return isBase64Url(payload.publicKey, 87)
      && isBase64Url(payload.guestPublicKey, 87)
      && isBase64Url(payload.mac, 43);
  }

  if (type === "offer" || type === "answer") {
    if (!isRecord(payload.description)) return false;
    return payload.description.type === type
      && typeof payload.description.sdp === "string"
      && payload.description.sdp.length > 0
      && payload.description.sdp.length <= 30_000;
  }

  if (type === "ice") {
    if (!isRecord(payload.candidate)) return false;
    const candidate = payload.candidate;
    return typeof candidate.candidate === "string"
      && candidate.candidate.length > 0
      && candidate.candidate.length <= 2_048
      && isOptionalString(candidate.sdpMid, 128)
      && (candidate.sdpMLineIndex === null
        || candidate.sdpMLineIndex === undefined
        || (Number.isInteger(candidate.sdpMLineIndex) && Number(candidate.sdpMLineIndex) >= 0 && Number(candidate.sdpMLineIndex) <= 32))
      && isOptionalString(candidate.usernameFragment, 256);
  }

  return false;
}
