export const CHUNK_SIZE = 64 * 1024;
export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const MAX_ENCRYPTED_CHUNK_SIZE = CHUNK_SIZE + 25;
export const MAX_CONTROL_PACKET_LENGTH = 32 * 1024;

export type FileOffer = {
  id: string;
  name: string;
  size: number;
  type: string;
  hash: string;
  chunks: number;
};

const blockedExtensions = new Set([
  "bat", "cmd", "com", "cpl", "exe", "hta", "js", "jse", "lnk",
  "msi", "msp", "ps1", "psm1", "reg", "scr", "vbe", "vbs", "wsf", "wsh",
]);

export function isBlockedExecutable(filename: string) {
  const extension = filename.trim().toLowerCase().split(".").pop() || "";
  return blockedExtensions.has(extension);
}

export function validateFileOffer(value: unknown): value is FileOffer {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const offer = value as Record<string, unknown>;
  if (typeof offer.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(offer.id)) return false;
  if (typeof offer.name !== "string" || !offer.name.trim() || offer.name.length > 255) return false;
  if (typeof offer.type !== "string" || offer.type.length > 255) return false;
  if (typeof offer.hash !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(offer.hash)) return false;
  if (!Number.isSafeInteger(offer.size) || Number(offer.size) < 0 || Number(offer.size) > MAX_FILE_SIZE) return false;
  if (!Number.isSafeInteger(offer.chunks) || Number(offer.chunks) !== Math.ceil(Number(offer.size) / CHUNK_SIZE)) return false;
  return true;
}
