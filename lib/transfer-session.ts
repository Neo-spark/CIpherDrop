export type Role = "host" | "guest";
export type TransferDirection = "host-to-guest" | "guest-to-host";
export type PreviewKind = "image" | "pdf" | "text" | "audio" | "video";

export const RECEIVED_TRAY_LIMIT = 100 * 1024 * 1024;
export const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024;

const rasterImageTypes = new Map([
  ["image/png", new Set(["png"])],
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/gif", new Set(["gif"])],
  ["image/webp", new Set(["webp"])],
  ["image/avif", new Set(["avif"])],
]);
const textExtensions = new Set(["txt", "csv", "json", "md", "markdown", "log"]);
const textTypes = new Set(["text/plain", "text/csv", "text/markdown", "application/json"]);
const audioExtensions = new Set(["mp3", "m4a", "aac", "wav", "ogg", "oga", "webm"]);
const videoExtensions = new Set(["mp4", "m4v", "webm", "ogv", "mov"]);

function extensionOf(name: string) {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index + 1).toLowerCase();
}

function normalizedType(type: string) {
  return type.split(";", 1)[0]?.trim().toLowerCase() || "";
}

export function isTransferDirection(value: unknown): value is TransferDirection {
  return value === "host-to-guest" || value === "guest-to-host";
}

export function senderRole(direction: TransferDirection): Role {
  return direction === "host-to-guest" ? "host" : "guest";
}

export function receiverRole(direction: TransferDirection): Role {
  return direction === "host-to-guest" ? "guest" : "host";
}

export function previewKindFor(name: string, type: string, size: number): PreviewKind | null {
  const extension = extensionOf(name);
  const mime = normalizedType(type);
  const imageExtensions = rasterImageTypes.get(mime);
  if (imageExtensions?.has(extension)) return "image";
  if (mime === "application/pdf" && extension === "pdf") return "pdf";
  if (textTypes.has(mime) && textExtensions.has(extension) && size <= TEXT_PREVIEW_LIMIT) return "text";
  if (mime.startsWith("audio/") && audioExtensions.has(extension)) return "audio";
  if (mime.startsWith("video/") && videoExtensions.has(extension)) return "video";
  return null;
}

export function fitsReceivedTray(retainedBytes: number, reservedBytes: number, incomingBytes: number) {
  if (![retainedBytes, reservedBytes, incomingBytes].every(Number.isSafeInteger)) return false;
  if (retainedBytes < 0 || reservedBytes < 0 || incomingBytes < 0) return false;
  return retainedBytes + reservedBytes + incomingBytes <= RECEIVED_TRAY_LIMIT;
}
