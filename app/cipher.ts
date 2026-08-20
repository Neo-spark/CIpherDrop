const textEncoder = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export function base64UrlToBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function createInvitationSecret() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createEphemeralKeyPair() {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const publicBytes = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  return { keyPair, publicKey: bytesToBase64Url(new Uint8Array(publicBytes)) };
}

export async function authenticateHandshake(secret: string, message: string) {
  const key = await crypto.subtle.importKey("raw", base64UrlToBytes(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return bytesToBase64Url(new Uint8Array(signature));
}

export function constantTimeEqual(left: string, right: string) {
  const a = textEncoder.encode(left);
  const b = textEncoder.encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index % a.length] ?? 0) ^ (b[index % b.length] ?? 0);
  return difference === 0;
}

function nonce(prefix: Uint8Array, sequence: bigint) {
  const value = new Uint8Array(12);
  value.set(prefix, 0);
  new DataView(value.buffer).setBigUint64(4, sequence, false);
  return value;
}

function additionalData(code: string, kind: "control" | "chunk", sequence: bigint) {
  return textEncoder.encode(`cipherdrop-v1|${code}|${kind}|${sequence.toString()}`);
}

export class SessionCipher {
  private sendSequence = BigInt(0);
  private receivedSequences = new Set<string>();
  private readonly code: string;
  private readonly sendKey: CryptoKey;
  private readonly receiveKey: CryptoKey;
  private readonly sendPrefix: Uint8Array;
  private readonly receivePrefix: Uint8Array;
  readonly safetyCode: string;

  constructor(
    code: string,
    sendKey: CryptoKey,
    receiveKey: CryptoKey,
    sendPrefix: Uint8Array,
    receivePrefix: Uint8Array,
    safetyCode: string,
  ) {
    this.code = code;
    this.sendKey = sendKey;
    this.receiveKey = receiveKey;
    this.sendPrefix = sendPrefix;
    this.receivePrefix = receivePrefix;
    this.safetyCode = safetyCode;
  }

  private nextSequence() {
    const value = this.sendSequence;
    this.sendSequence += BigInt(1);
    return value;
  }

  private checkReplay(kind: string, sequence: bigint) {
    const key = `${kind}:${sequence.toString()}`;
    if (this.receivedSequences.has(key)) throw new Error("Replay detected");
    this.receivedSequences.add(key);
    if (this.receivedSequences.size > 20_000) {
      const first = this.receivedSequences.values().next().value;
      if (first) this.receivedSequences.delete(first);
    }
  }

  async encryptControl(message: unknown) {
    const sequence = this.nextSequence();
    const encrypted = await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv: nonce(this.sendPrefix, sequence),
      additionalData: additionalData(this.code, "control", sequence),
      tagLength: 128,
    }, this.sendKey, textEncoder.encode(JSON.stringify(message)));
    return `CD1:${sequence.toString()}:${bytesToBase64Url(new Uint8Array(encrypted))}`;
  }

  async decryptControl(packet: string) {
    const [version, rawSequence, ciphertext] = packet.split(":");
    if (version !== "CD1" || !rawSequence || !ciphertext) throw new Error("Invalid encrypted packet");
    const sequence = BigInt(rawSequence);
    this.checkReplay("control", sequence);
    const cleartext = await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: nonce(this.receivePrefix, sequence),
      additionalData: additionalData(this.code, "control", sequence),
      tagLength: 128,
    }, this.receiveKey, base64UrlToBytes(ciphertext));
    return JSON.parse(new TextDecoder().decode(cleartext)) as Record<string, unknown>;
  }

  async encryptChunk(chunk: ArrayBuffer) {
    const sequence = this.nextSequence();
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({
      name: "AES-GCM",
      iv: nonce(this.sendPrefix, sequence),
      additionalData: additionalData(this.code, "chunk", sequence),
      tagLength: 128,
    }, this.sendKey, chunk));
    const packet = new Uint8Array(9 + encrypted.length);
    packet[0] = 1;
    new DataView(packet.buffer).setBigUint64(1, sequence, false);
    packet.set(encrypted, 9);
    return packet.buffer;
  }

  async decryptChunk(packet: ArrayBuffer) {
    const bytes = new Uint8Array(packet);
    if (bytes[0] !== 1 || bytes.length < 26) throw new Error("Invalid chunk packet");
    const sequence = new DataView(packet).getBigUint64(1, false);
    this.checkReplay("chunk", sequence);
    return await crypto.subtle.decrypt({
      name: "AES-GCM",
      iv: nonce(this.receivePrefix, sequence),
      additionalData: additionalData(this.code, "chunk", sequence),
      tagLength: 128,
    }, this.receiveKey, bytes.slice(9));
  }
}

export async function deriveSessionCipher(input: {
  code: string;
  role: "host" | "guest";
  keyPair: CryptoKeyPair;
  otherPublicKey: string;
  hostPublicKey: string;
  guestPublicKey: string;
  invitationSecret: string;
}) {
  const otherKey = await crypto.subtle.importKey("raw", base64UrlToBytes(input.otherPublicKey), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: otherKey }, input.keyPair.privateKey, 256);
  const source = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  const context = textEncoder.encode(`cipherdrop-v1|${input.code}|${input.hostPublicKey}|${input.guestPublicKey}`);
  const material = new Uint8Array(await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: base64UrlToBytes(input.invitationSecret),
    info: context,
  }, source, 640));

  const hostToGuest = await crypto.subtle.importKey("raw", material.slice(0, 32), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const guestToHost = await crypto.subtle.importKey("raw", material.slice(32, 64), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  const hostPrefix = material.slice(64, 68);
  const guestPrefix = material.slice(68, 72);
  const safetyValue = new DataView(material.buffer, material.byteOffset + 72, 4).getUint32(0, false) % 1_000_000;
  const safetyCode = safetyValue.toString().padStart(6, "0").replace(/(\d{3})(\d{3})/u, "$1 $2");

  return input.role === "host"
    ? new SessionCipher(input.code, hostToGuest, guestToHost, hostPrefix, guestPrefix, safetyCode)
    : new SessionCipher(input.code, guestToHost, hostToGuest, guestPrefix, hostPrefix, safetyCode);
}

export async function sha256(value: ArrayBuffer) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", value)));
}
