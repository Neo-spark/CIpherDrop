"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  authenticateHandshake,
  constantTimeEqual,
  createEphemeralKeyPair,
  createInvitationSecret,
  deriveSessionCipher,
  SessionCipher,
  sha256,
} from "./cipher";
import {
  CHUNK_SIZE,
  type FileOffer,
  isBlockedExecutable,
  MAX_CONTROL_PACKET_LENGTH,
  MAX_ENCRYPTED_CHUNK_SIZE,
  MAX_FILE_SIZE,
  validateFileOffer,
} from "@/lib/file-protocol";
import {
  fitsReceivedTray,
  isTransferDirection,
  previewKindFor,
  RECEIVED_TRAY_LIMIT,
  senderRole,
  type PreviewKind,
  type Role,
  type TransferDirection,
} from "@/lib/transfer-session";

type Session = {
  code: string;
  token: string;
  role: Role;
  secret: string;
  keyPair: CryptoKeyPair;
  publicKey: string;
  expiresAt: number;
  direction: TransferDirection;
};
type SignalEvent = { id: number; type: string; payload: Record<string, unknown> };
type Transfer = { name: string; direction: "sending" | "receiving"; progress: number; detail: string };
type ReceivedFile = FileOffer & { blob: Blob; url: string; previewKind: PreviewKind | null };

const defaultIceServers: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/u, "");
const RELAY_ONLY = process.env.NEXT_PUBLIC_RELAY_ONLY === "true";

async function api<T>(path: string, options: RequestInit = {}, session?: Session): Promise<T> {
  if (!API_BASE_URL) throw new Error("The connection service is not configured");
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (session) headers.set("authorization", `Bearer ${session.token}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers, cache: "no-store" });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "The secure request failed");
  return result;
}

async function invitationFrom(value: string) {
  const trimmed = value.trim();
  if (/^[A-Z2-9]{5}-?[A-Z2-9]{5}$/iu.test(trimmed)) {
    const raw = trimmed.replace("-", "").toUpperCase();
    const code = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    return { code, secret: await sha256(new TextEncoder().encode(`cipherdrop-code-v1|${code}`).buffer), mode: "code" as const };
  }
  const url = new URL(trimmed, window.location.origin);
  const code = (url.searchParams.get("room") || "").toUpperCase();
  const secret = new URLSearchParams(url.hash.slice(1)).get("k") || "";
  if (!/^[A-Z2-9]{5}-[A-Z2-9]{5}$/u.test(code) || secret.length < 40) throw new Error("Enter a 10-character code or paste the complete invitation link");
  return { code, secret, mode: "link" as const };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function safeFilename(value: string) {
  const safe = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || "\\/:*?\"<>|".includes(character) ? "_" : character;
  }).join("");
  return safe.slice(0, 180) || "cipherdrop-file";
}

export default function CipherDropClient() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [phase, setPhase] = useState("Ready for a private transfer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [incomingRequest, setIncomingRequest] = useState(false);
  const [guestKeyReady, setGuestKeyReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [safetyCode, setSafetyCode] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [incomingFile, setIncomingFile] = useState<FileOffer | null>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [fileOfferPending, setFileOfferPending] = useState(false);
  const [relayAvailable, setRelayAvailable] = useState(false);
  const [connectionMode, setConnectionMode] = useState<"link" | "code">("link");
  const [receivedFiles, setReceivedFiles] = useState<ReceivedFile[]>([]);
  const [previewingFile, setPreviewingFile] = useState<ReceivedFile | null>(null);
  const [textPreview, setTextPreview] = useState("");

  const sessionRef = useRef<Session | null>(null);
  const cipherRef = useRef<SessionCipher | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const lastEventRef = useRef(0);
  const guestHandshakeRef = useRef<{ publicKey: string; mac: string } | null>(null);
  const negotiatedSecretRef = useRef("");
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const currentSendRef = useRef<{ file: File; offer: FileOffer } | null>(null);
  const receiveRef = useRef<{ offer: FileOffer; chunks: ArrayBuffer[]; bytes: number } | null>(null);
  const handleSignalRef = useRef<(event: SignalEvent) => Promise<void>>(async () => undefined);
  const handleControlRef = useRef<(message: Record<string, unknown>) => Promise<void>>(async () => undefined);
  const iceServersRef = useRef<RTCIceServer[]>(defaultIceServers);
  const relayAvailableRef = useRef(false);
  const receivedFilesRef = useRef<ReceivedFile[]>([]);

  useEffect(() => { sessionRef.current = session; }, [session]);

  const replaceReceivedFiles = useCallback((files: ReceivedFile[]) => {
    receivedFilesRef.current = files;
    setReceivedFiles(files);
  }, []);

  const clearReceivedFiles = useCallback(() => {
    for (const file of receivedFilesRef.current) URL.revokeObjectURL(file.url);
    replaceReceivedFiles([]);
    setPreviewingFile(null);
    setTextPreview("");
  }, [replaceReceivedFiles]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    const secret = new URLSearchParams(window.location.hash.slice(1)).get("k");
    if (room && secret) queueMicrotask(() => setInviteInput(window.location.href));
  }, []);

  const sendSignal = useCallback(async (type: string, payload: Record<string, unknown>, target = sessionRef.current) => {
    if (!target) throw new Error("The room is no longer active");
    await api(`/api/sessions/${target.code}/signals?role=${target.role}`, {
      method: "POST",
      body: JSON.stringify({ type, payload }),
    }, target);
  }, []);

  const sendControl = useCallback(async (message: Record<string, unknown>) => {
    const cipher = cipherRef.current;
    const channel = channelRef.current;
    if (!cipher || !channel || channel.readyState !== "open") throw new Error("Encrypted channel is not ready");
    channel.send(await cipher.encryptControl(message));
  }, []);

  const loadIceConfig = async (target: Session) => {
    try {
      const result = await api<{ iceServers: RTCIceServer[]; relayAvailable: boolean }>(`/api/sessions/${target.code}/ice?role=${target.role}`, {}, target);
      iceServersRef.current = result.iceServers.length ? result.iceServers : defaultIceServers;
      relayAvailableRef.current = result.relayAvailable;
      setRelayAvailable(result.relayAvailable);
    } catch {
      iceServersRef.current = defaultIceServers;
      relayAvailableRef.current = false;
      setRelayAvailable(false);
    }
  };

  const attachChannel = useCallback((channel: RTCDataChannel) => {
    channelRef.current = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = 512 * 1024;
    channel.onopen = () => {
      setConnected(true);
      const target = sessionRef.current;
      setPhase(target && senderRole(target.direction) === target.role
        ? "Connected securely — this device can send"
        : "Connected securely — this device can receive");
      if (cipherRef.current) setSafetyCode(cipherRef.current.safetyCode);
    };
    channel.onclose = () => {
      setConnected(false);
      setPhase("The private connection ended");
      clearReceivedFiles();
    };
    channel.onerror = () => setError("The encrypted data channel reported an error");
    channel.onmessage = async (event) => {
      try {
        const cipher = cipherRef.current;
        if (!cipher) throw new Error("Encryption keys are unavailable");
        if (typeof event.data === "string") {
          if (event.data.length > MAX_CONTROL_PACKET_LENGTH) throw new Error("Encrypted control message exceeded the safety limit");
          await handleControlRef.current(await cipher.decryptControl(event.data));
          return;
        }
        if (!(event.data instanceof ArrayBuffer) || event.data.byteLength > MAX_ENCRYPTED_CHUNK_SIZE) {
          throw new Error("Encrypted file chunk exceeded the safety limit");
        }
        const target = sessionRef.current;
        if (!target || senderRole(target.direction) === target.role) throw new Error("The receiving direction was violated");
        const chunk = await cipher.decryptChunk(event.data as ArrayBuffer);
        const receiving = receiveRef.current;
        if (!receiving) throw new Error("Unexpected encrypted file data");
        const nextBytes = receiving.bytes + chunk.byteLength;
        if (chunk.byteLength > CHUNK_SIZE
          || nextBytes > receiving.offer.size
          || receiving.chunks.length + 1 > receiving.offer.chunks) {
          throw new Error("The sender exceeded the approved file bounds");
        }
        receiving.chunks.push(chunk);
        receiving.bytes = nextBytes;
        setTransfer({
          name: receiving.offer.name,
          direction: "receiving",
          progress: Math.min(100, (receiving.bytes / receiving.offer.size) * 100),
          detail: `${formatBytes(receiving.bytes)} of ${formatBytes(receiving.offer.size)}`,
        });
      } catch (caught) {
        receiveRef.current = null;
        channel.close();
        peerRef.current?.close();
        setConnected(false);
        setError(caught instanceof Error ? caught.message : "Encrypted packet verification failed");
      }
    };
  }, [clearReceivedFiles]);

  const setupPeer = useCallback((role: Role) => {
    if (RELAY_ONLY && !relayAvailableRef.current) throw new Error("Private relay mode is required but no TURN relay is configured");
    peerRef.current?.close();
    const peer = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceTransportPolicy: RELAY_ONLY ? "relay" : "all",
    });
    peerRef.current = peer;
    pendingIceRef.current = [];
    peer.onicecandidate = (event) => {
      if (event.candidate) void sendSignal("ice", { candidate: event.candidate.toJSON() });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") setError("Direct connection failed. A production TURN credential is required on restrictive networks.");
      if (peer.connectionState === "disconnected") setPhase("Peer connection interrupted");
    };
    if (role === "host") attachChannel(peer.createDataChannel("cipherdrop", { ordered: true }));
    else peer.ondatachannel = (event) => attachChannel(event.channel);
    return peer;
  }, [attachChannel, sendSignal]);

  const flushIce = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer?.remoteDescription) return;
    for (const candidate of pendingIceRef.current.splice(0)) await peer.addIceCandidate(candidate);
  }, []);

  const deriveCipher = useCallback(async (target: Session, otherPublicKey: string, hostPublicKey: string, guestPublicKey: string) => {
    const cipher = await deriveSessionCipher({
      code: target.code,
      role: target.role,
      keyPair: target.keyPair,
      otherPublicKey,
      hostPublicKey,
      guestPublicKey,
      invitationSecret: target.secret,
      transferDirection: target.direction,
    });
    cipherRef.current = cipher;
    setSafetyCode(cipher.safetyCode);
    return cipher;
  }, []);

  const createRoom = async (direction: TransferDirection) => {
    setBusy(true); setError("");
    try {
      const secret = createInvitationSecret();
      const ephemeral = await createEphemeralKeyPair();
      const created = await api<{ code: string; token: string; direction: TransferDirection; expiresAt: number }>("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ direction }),
      });
      if (!isTransferDirection(created.direction) || created.direction !== direction) throw new Error("The room direction could not be verified");
      const next: Session = { ...created, role: "host", secret, ...ephemeral };
      sessionRef.current = next;
      setSession(next);
      await loadIceConfig(next);
      const invitation = `${window.location.origin}/?room=${encodeURIComponent(created.code)}#k=${secret}`;
      setInviteLink(invitation);
      setQrCodeUrl(await QRCode.toDataURL(invitation, { errorCorrectionLevel: "M", margin: 1, width: 220 }));
      setPhase("Waiting for one trusted person");
      lastEventRef.current = 0;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create room"); }
    finally { setBusy(false); }
  };

  const joinRoom = async () => {
    setBusy(true); setError("");
    try {
      const parsed = await invitationFrom(inviteInput);
      const existing = sessionRef.current;
      if (existing) {
        try { await api(`/api/sessions/${existing.code}/close?role=${existing.role}`, { method: "POST" }, existing); } catch { /* expired rooms need no cleanup */ }
        channelRef.current?.close();
        peerRef.current?.close();
        sessionRef.current = null;
      }
      const ephemeral = await createEphemeralKeyPair();
      const joined = await api<{ code: string; token: string; direction: TransferDirection; expiresAt: number }>(`/api/sessions/${parsed.code}/join`, { method: "POST" });
      if (!isTransferDirection(joined.direction)) throw new Error("The room has an invalid transfer direction");
      const next: Session = { ...joined, role: "guest", secret: parsed.secret, ...ephemeral };
      sessionRef.current = next;
      setSession(next);
      await loadIceConfig(next);
      setPhase("Connection request sent");
      setConnectionMode(parsed.mode);
      negotiatedSecretRef.current = parsed.secret;
      lastEventRef.current = 0;
      const mac = await authenticateHandshake(parsed.secret, `guest-key|${parsed.code}|${next.direction}|${ephemeral.publicKey}`);
      await sendSignal("guest-key", { publicKey: ephemeral.publicKey, mac, mode: parsed.mode, direction: next.direction }, next);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not join room"); }
    finally { setBusy(false); }
  };

  const acceptPeer = async () => {
    const target = sessionRef.current;
    const guest = guestHandshakeRef.current;
    if (!target || target.role !== "host" || !guest) return;
    setBusy(true); setError("");
    try {
      const handshakeSecret = negotiatedSecretRef.current || target.secret;
      const expected = await authenticateHandshake(handshakeSecret, `guest-key|${target.code}|${target.direction}|${guest.publicKey}`);
      if (!constantTimeEqual(expected, guest.mac)) throw new Error("The invitation authentication check failed");
      await deriveCipher({ ...target, secret: handshakeSecret }, guest.publicKey, target.publicKey, guest.publicKey);
      const mac = await authenticateHandshake(handshakeSecret, `accept|${target.code}|${target.direction}|${target.publicKey}|${guest.publicKey}`);
      await sendSignal("accept", { publicKey: target.publicKey, guestPublicKey: guest.publicKey, mac, direction: target.direction });
      const peer = setupPeer("host");
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal("offer", { description: peer.localDescription });
      setIncomingRequest(false);
      setPhase("Establishing the encrypted connection");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not accept peer"); }
    finally { setBusy(false); }
  };

  const rejectPeer = async () => {
    try { await sendSignal("reject", {}); } catch { /* session expiry is already a rejection */ }
    setIncomingRequest(false);
    setPhase("Connection request rejected");
  };

  const handleSignal = async (event: SignalEvent) => {
    const target = sessionRef.current;
    if (!target) return;
    if (event.type === "join-request" && target.role === "host") {
      setIncomingRequest(true); setPhase("Connection request received"); return;
    }
    if (event.type === "guest-key" && target.role === "host") {
      if (event.payload.direction !== target.direction) throw new Error("The peer requested a different transfer direction");
      guestHandshakeRef.current = { publicKey: String(event.payload.publicKey), mac: String(event.payload.mac) };
      const mode = event.payload.mode === "code" ? "code" : "link";
      setConnectionMode(mode);
      negotiatedSecretRef.current = mode === "code"
        ? await sha256(new TextEncoder().encode(`cipherdrop-code-v1|${target.code}`).buffer)
        : target.secret;
      setGuestKeyReady(true); return;
    }
    if (event.type === "reject") { setPhase("The connection request was rejected"); return; }
    if (event.type === "accept" && target.role === "guest") {
      const hostPublicKey = String(event.payload.publicKey);
      const guestPublicKey = String(event.payload.guestPublicKey);
      const mac = String(event.payload.mac);
      if (event.payload.direction !== target.direction) throw new Error("The host changed the transfer direction");
      if (guestPublicKey !== target.publicKey) throw new Error("Handshake identity mismatch");
      const expected = await authenticateHandshake(target.secret, `accept|${target.code}|${target.direction}|${hostPublicKey}|${guestPublicKey}`);
      if (!constantTimeEqual(expected, mac)) throw new Error("Peer authentication failed. End this session.");
      await deriveCipher(target, hostPublicKey, hostPublicKey, guestPublicKey);
      setupPeer("guest");
      setPhase("Invitation verified; connecting securely");
      return;
    }
    if (event.type === "offer" && target.role === "guest") {
      const peer = peerRef.current || setupPeer("guest");
      await peer.setRemoteDescription(event.payload.description as RTCSessionDescriptionInit);
      await flushIce();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal("answer", { description: peer.localDescription });
      return;
    }
    if (event.type === "answer" && target.role === "host" && peerRef.current) {
      await peerRef.current.setRemoteDescription(event.payload.description as RTCSessionDescriptionInit);
      await flushIce(); return;
    }
    if (event.type === "ice") {
      const candidate = event.payload.candidate as RTCIceCandidateInit;
      if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(candidate);
      else pendingIceRef.current.push(candidate);
      return;
    }
    if (event.type === "leave") { setConnected(false); clearReceivedFiles(); setPhase("The other person ended the session"); }
  };

  useEffect(() => { handleSignalRef.current = handleSignal; });

  useEffect(() => {
    if (!session || connected) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<{ events: SignalEvent[] }>(`/api/sessions/${session.code}/signals?role=${session.role}&after=${lastEventRef.current}`, {}, session);
        for (const event of result.events) {
          lastEventRef.current = Math.max(lastEventRef.current, event.id);
          await handleSignalRef.current(event);
        }
      } catch (caught) {
        if (!stopped) setError(caught instanceof Error ? caught.message : "Secure signaling was interrupted");
      }
      if (!stopped) timer = setTimeout(poll, 850);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [session, connected]);

  const waitForBuffer = async (channel: RTCDataChannel) => {
    if (channel.bufferedAmount < 2 * 1024 * 1024) return;
    await new Promise<void>((resolve) => {
      const done = () => { channel.removeEventListener("bufferedamountlow", done); resolve(); };
      channel.addEventListener("bufferedamountlow", done, { once: true });
    });
  };

  const transmitFile = async (file: File, offer: FileOffer) => {
    const channel = channelRef.current;
    const cipher = cipherRef.current;
    if (!channel || !cipher) return;
    try {
      let sent = 0;
      for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
        await waitForBuffer(channel);
        const clearChunk = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer();
        channel.send(await cipher.encryptChunk(clearChunk));
        sent += clearChunk.byteLength;
        setTransfer({ name: file.name, direction: "sending", progress: (sent / file.size) * 100, detail: `${formatBytes(sent)} of ${formatBytes(file.size)}` });
      }
      await sendControl({ type: "file-complete", id: offer.id });
      setTransfer({ name: file.name, direction: "sending", progress: 100, detail: "Sent; waiting for integrity confirmation" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Encrypted transfer failed"); }
  };

  const offerSelectedFile = async () => {
    const target = sessionRef.current;
    if (!selectedFile || !target) return;
    setBusy(true); setError("");
    try {
      if (senderRole(target.direction) !== target.role) throw new Error("This device is locked to receiving files");
      if (selectedFile.size > MAX_FILE_SIZE) throw new Error("This version accepts files up to 100 MB to protect browser memory");
      if (isBlockedExecutable(selectedFile.name)) throw new Error("Executable and script files are blocked for safety");
      const hash = await sha256(await selectedFile.arrayBuffer());
      const offer: FileOffer = {
        id: crypto.randomUUID(), name: selectedFile.name, size: selectedFile.size,
        type: selectedFile.type || "application/octet-stream", hash,
        chunks: Math.ceil(selectedFile.size / CHUNK_SIZE),
      };
      currentSendRef.current = { file: selectedFile, offer };
      setFileOfferPending(true);
      await sendControl({ type: "file-offer", offer });
      setTransfer({ name: selectedFile.name, direction: "sending", progress: 0, detail: "Waiting for receiver approval" });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not offer file"); }
    finally { setBusy(false); }
  };

  const acceptFile = async () => {
    const target = sessionRef.current;
    if (!incomingFile || !target) return;
    if (senderRole(target.direction) === target.role) throw new Error("This device is locked to sending files");
    const retainedBytes = receivedFilesRef.current.reduce((total, file) => total + file.size, 0);
    const reservedBytes = receiveRef.current?.offer.size || 0;
    if (!fitsReceivedTray(retainedBytes, reservedBytes, incomingFile.size)) {
      setError("Remove received files before accepting this transfer. The temporary tray is limited to 100 MB.");
      return;
    }
    receiveRef.current = { offer: incomingFile, chunks: [], bytes: 0 };
    setTransfer({ name: incomingFile.name, direction: "receiving", progress: 0, detail: "Encrypted transfer starting" });
    await sendControl({ type: "file-accept", id: incomingFile.id });
    setIncomingFile(null);
  };

  const finishReceivedFile = async (id: string) => {
    const receiving = receiveRef.current;
    if (!receiving || receiving.offer.id !== id) throw new Error("File completion message did not match the active transfer");
    if (receiving.bytes !== receiving.offer.size) throw new Error("The received file size did not match");
    if (receiving.chunks.length !== receiving.offer.chunks) throw new Error("The received file chunk count did not match");
    const blob = new Blob(receiving.chunks, { type: receiving.offer.type });
    const actualHash = await sha256(await blob.arrayBuffer());
    if (!constantTimeEqual(actualHash, receiving.offer.hash)) throw new Error("File integrity verification failed");
    const url = URL.createObjectURL(blob);
    const received: ReceivedFile = {
      ...receiving.offer,
      blob,
      url,
      previewKind: previewKindFor(receiving.offer.name, receiving.offer.type, receiving.offer.size),
    };
    replaceReceivedFiles([...receivedFilesRef.current, received]);
    setTransfer({ name: receiving.offer.name, direction: "receiving", progress: 100, detail: "Verified and ready to view or download" });
    await sendControl({ type: "receipt", id, verified: true });
    receiveRef.current = null;
  };

  const handleControl = async (message: Record<string, unknown>) => {
    const type = String(message.type || "");
    const target = sessionRef.current;
    if (!target) throw new Error("The room is no longer active");
    const localIsSender = senderRole(target.direction) === target.role;
    if (type === "file-offer") {
      if (localIsSender) throw new Error("The transfer direction was violated by the receiving device");
      if (incomingFile || receiveRef.current) throw new Error("Only one file transfer can be active at a time");
      const offer = message.offer;
      if (!validateFileOffer(offer) || isBlockedExecutable(offer.name)) throw new Error("Unsafe file offer rejected");
      setIncomingFile(offer); return;
    }
    if (type === "file-accept") {
      if (!localIsSender) throw new Error("The transfer direction was violated by the sending device");
      const sending = currentSendRef.current;
      if (sending && sending.offer.id === message.id) void transmitFile(sending.file, sending.offer);
      return;
    }
    if (type === "file-reject") {
      if (!localIsSender) throw new Error("Unexpected file rejection received by the receiver");
      setTransfer(null); setFileOfferPending(false); currentSendRef.current = null; setPhase("The file was declined"); return;
    }
    if (type === "file-complete") {
      if (localIsSender) throw new Error("Unexpected file completion received by the sender");
      await finishReceivedFile(String(message.id)); return;
    }
    if (type === "receipt" && message.verified) {
      if (!localIsSender) throw new Error("Unexpected verification receipt received by the receiver");
      setTransfer((value) => value ? { ...value, progress: 100, detail: "Receiver verified the complete file" } : value);
      currentSendRef.current = null;
      setFileOfferPending(false);
      setSelectedFile(null);
    }
  };

  useEffect(() => { handleControlRef.current = handleControl; });

  const downloadReceivedFile = (file: ReceivedFile) => {
    const link = document.createElement("a");
    link.href = file.url;
    link.download = safeFilename(file.name);
    link.rel = "noopener";
    link.click();
  };

  const viewReceivedFile = async (file: ReceivedFile) => {
    if (!file.previewKind) return;
    setError("");
    setTextPreview(file.previewKind === "text" ? await file.blob.text() : "");
    setPreviewingFile(file);
  };

  const removeReceivedFile = (id: string) => {
    const file = receivedFilesRef.current.find((candidate) => candidate.id === id);
    if (file) URL.revokeObjectURL(file.url);
    if (previewingFile?.id === id) { setPreviewingFile(null); setTextPreview(""); }
    replaceReceivedFiles(receivedFilesRef.current.filter((candidate) => candidate.id !== id));
  };

  const endSession = async () => {
    const target = sessionRef.current;
    if (target) {
      try { await sendSignal("leave", {}, target); } catch { /* best effort */ }
      try { await api(`/api/sessions/${target.code}/close?role=${target.role}`, { method: "POST" }, target); } catch { /* TTL cleanup remains */ }
    }
    channelRef.current?.close(); peerRef.current?.close();
    channelRef.current = null; peerRef.current = null; cipherRef.current = null; sessionRef.current = null;
    clearReceivedFiles();
    setSession(null); setConnected(false); setIncomingRequest(false); setSelectedFile(null); setIncomingFile(null); setTransfer(null); setFileOfferPending(false); setRelayAvailable(false); setSafetyCode("");
    negotiatedSecretRef.current = "";
    setPhase("Session destroyed"); setInviteLink(""); setQrCodeUrl(""); window.history.replaceState({}, "", window.location.pathname);
  };

  useEffect(() => {
    const close = () => { clearReceivedFiles(); peerRef.current?.close(); channelRef.current?.close(); };
    window.addEventListener("pagehide", close);
    return () => window.removeEventListener("pagehide", close);
  }, [clearReceivedFiles]);

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setPhase("Private invitation copied");
  };

  const localIsSender = Boolean(session && senderRole(session.direction) === session.role);
  const receivedBytes = receivedFiles.reduce((total, file) => total + file.size, 0);
  const incomingFits = !incomingFile || fitsReceivedTray(receivedBytes, 0, incomingFile.size);

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="wordmark" onClick={() => { if (!session) router.push("/"); }} aria-label="CipherDrop home">
          <span className="wordmark-icon" aria-hidden="true">C</span>
          CipherDrop
        </button>
        <span className="privacy-status"><span className="dot online" /> No account required</span>
      </header>

      <div className="content">
        {!session ? (
          <section className="start-card">
            <h1>{busy ? "Preparing a secure session…" : "Move files between two devices"}</h1>
            <p>Choose what this device should do. The direction stays locked for the entire session.</p>
            {error && <div className="notice error" role="alert">{error}</div>}
            <div className="direction-grid">
              <button className="direction-card" type="button" onClick={() => createRoom("host-to-guest")} disabled={busy}>
                <strong>Send files</strong><span>Choose files on this device</span>
              </button>
              <button className="direction-card" type="button" onClick={() => createRoom("guest-to-host")} disabled={busy}>
                <strong>Receive files</strong><span>Keep files temporarily on this device</span>
              </button>
            </div>
            <div className="divider"><span>or join another device</span></div>
            <div className="input-action">
              <label className="sr-only" htmlFor="invite">Connection code or invitation link</label>
              <input id="invite" value={inviteInput} onChange={(event) => setInviteInput(event.target.value)} placeholder="Code or invitation link" autoComplete="off" spellCheck={false} />
              <button className="button primary" type="button" onClick={joinRoom} disabled={busy || !inviteInput}>Connect</button>
            </div>
          </section>
        ) : (
          <section className="session">
            <div className="session-heading">
              <div>
                <h1>{connected ? (localIsSender ? "Send files" : "Receive files") : session.role === "host" ? "Pair another device" : "Connecting…"}</h1>
                <div className="status"><span className={connected ? "dot online" : "dot"} />{phase}</div>
              </div>
              <button className="button subtle danger" onClick={endSession}>End session</button>
            </div>

            {error && <div className="notice error" role="alert">{error}</div>}

            {session.role === "host" && !connected && (
              <div className="connect-card">
                <div className="code-section">
                  <span className="label">Your code</span>
                  <div className="connection-code">{session.code}</div>
                  <p>The paired device will {session.direction === "host-to-guest" ? "receive files from this device" : "send files to this device"}.</p>
                </div>

                <div className="divider"><span>or</span></div>

                {qrCodeUrl && (
                  <div className="qr-section">
                    <span className="label">Scan the private invitation</span>
                    <Image src={qrCodeUrl} width={220} height={220} unoptimized alt="QR code for this private CipherDrop session" />
                    <p>Scan with the other device. The invitation secret stays inside this QR code.</p>
                  </div>
                )}

                <div className="divider"><span>or copy the link</span></div>

                <div className="link-section">
                  <span className="label">Invitation link</span>
                  <div className="copy-row">
                    <input value={inviteLink} readOnly aria-label="Private invitation link" />
                    <button className="button secondary" onClick={copyInvite}>Copy</button>
                  </div>
                </div>
              </div>
            )}

            {incomingRequest && (
              <div className="request-card" aria-live="polite">
                <div><strong>Connection request</strong><p>Accept only if you recognize the person.</p></div>
                <div className="button-row">
                  <button className="button subtle" onClick={rejectPeer}>Decline</button>
                  <button className="button primary" onClick={acceptPeer} disabled={!guestKeyReady || busy}>{guestKeyReady ? "Accept" : "Checking…"}</button>
                </div>
              </div>
            )}

            {connected && (
              <div className="transfer-card">
                <div className="verification">
                  <span><span className="dot online" /> Connected {relayAvailable ? "through relay" : "directly"}</span>
                  <span>Safety code <strong>{safetyCode}</strong></span>
                </div>
                {connectionMode === "code" && <p className="safety-note">Compare the safety code with the other person before sending.</p>}
                {!RELAY_ONLY && <p className="safety-note">Direct peer connections can reveal your IP address to the other person.</p>}

                <div className="direction-banner">
                  <strong>{localIsSender ? "This device can send" : "This device can receive"}</strong>
                  <span>The direction is locked until this session ends.</span>
                </div>

                {localIsSender && (
                  <>
                    <label className="file-picker">
                      <input type="file" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
                      {selectedFile ? (
                        <><strong>{selectedFile.name}</strong><span>{formatBytes(selectedFile.size)}</span></>
                      ) : (
                        <><strong>Choose a file</strong><span>Up to 100 MB</span></>
                      )}
                    </label>
                    <button className="button primary full" onClick={offerSelectedFile} disabled={!selectedFile || busy || fileOfferPending}>Send file</button>
                  </>
                )}

                {!localIsSender && incomingFile && (
                  <div className="file-offer">
                    <div>
                      <strong>{incomingFile.name}</strong>
                      <span>{formatBytes(incomingFile.size)} · {incomingFile.type || "Unknown type"} · Not malware-scanned</span>
                      {!incomingFits && <span className="capacity-warning">Remove files to free temporary memory before accepting.</span>}
                    </div>
                    <div className="button-row">
                      <button className="button subtle" onClick={() => { void sendControl({ type: "file-reject", id: incomingFile.id }); setIncomingFile(null); }}>Decline</button>
                      <button className="button primary" onClick={acceptFile} disabled={!incomingFits}>Receive</button>
                    </div>
                  </div>
                )}

                {transfer && (
                  <div className="progress" aria-live="polite">
                    <div><strong>{transfer.name}</strong><span>{Math.round(transfer.progress)}%</span></div>
                    <progress className="progress-track" max={100} value={transfer.progress} aria-label="File transfer progress" />
                    <small>{transfer.detail}</small>
                  </div>
                )}

                {!localIsSender && (
                  <section className="received-tray" aria-labelledby="received-files-title">
                    <div className="tray-heading">
                      <div><h2 id="received-files-title">Received files</h2><p>{formatBytes(receivedBytes)} of {formatBytes(RECEIVED_TRAY_LIMIT)} held temporarily</p></div>
                      {receivedFiles.length > 0 && <button className="button subtle danger" type="button" onClick={clearReceivedFiles}>Clear all</button>}
                    </div>
                    {receivedFiles.length === 0 ? (
                      <p className="empty-tray">Verified files will appear here. Nothing downloads automatically.</p>
                    ) : receivedFiles.map((file) => (
                      <article className="received-file" key={file.id}>
                        <div><strong>{file.name}</strong><span>{formatBytes(file.size)} · {file.type || "Unknown type"} · Verified</span></div>
                        <div className="button-row">
                          {file.previewKind && <button className="button subtle" type="button" onClick={() => void viewReceivedFile(file)}>View</button>}
                          <button className="button secondary" type="button" onClick={() => downloadReceivedFile(file)}>Download</button>
                          <button className="button subtle danger" type="button" onClick={() => removeReceivedFile(file.id)}>Remove</button>
                        </div>
                      </article>
                    ))}
                  </section>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {previewingFile && (
        <div className="preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewingFile(null); }}>
          <section className="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title">
            <div className="preview-heading">
              <div><h2 id="preview-title">{previewingFile.name}</h2><p>{formatBytes(previewingFile.size)} · Temporary preview</p></div>
              <button className="button subtle" type="button" onClick={() => { setPreviewingFile(null); setTextPreview(""); }}>Close</button>
            </div>
            <div className="preview-content">
              {previewingFile.previewKind === "image" && <Image className="preview-image" src={previewingFile.url} alt={previewingFile.name} width={1200} height={900} unoptimized />}
              {previewingFile.previewKind === "pdf" && <iframe src={previewingFile.url} title={`Preview of ${previewingFile.name}`} sandbox="" />}
              {previewingFile.previewKind === "text" && <pre>{textPreview}</pre>}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              {previewingFile.previewKind === "audio" && <audio src={previewingFile.url} controls aria-label={`Preview of ${previewingFile.name}`} />}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              {previewingFile.previewKind === "video" && <video src={previewingFile.url} controls aria-label={`Preview of ${previewingFile.name}`} />}
            </div>
            <button className="button primary full" type="button" onClick={() => downloadReceivedFile(previewingFile)}>Download file</button>
          </section>
        </div>
      )}

      <footer>End-to-end encrypted. Files are never stored by CipherDrop.</footer>
    </main>
  );
}
