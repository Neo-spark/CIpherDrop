"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  authenticateHandshake,
  constantTimeEqual,
  createEphemeralKeyPair,
  createInvitationSecret,
  deriveSessionCipher,
  SessionCipher,
  sha256,
} from "./cipher";

type Role = "host" | "guest";
type Session = {
  code: string;
  token: string;
  role: Role;
  secret: string;
  keyPair: CryptoKeyPair;
  publicKey: string;
  expiresAt: number;
};
type SignalEvent = { id: number; type: string; payload: Record<string, unknown> };
type FileOffer = { id: string; name: string; size: number; type: string; hash: string; chunks: number };
type Transfer = { name: string; direction: "sending" | "receiving"; progress: number; detail: string };

const CHUNK_SIZE = 64 * 1024;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const defaultIceServers: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];

async function api<T>(path: string, options: RequestInit = {}, session?: Session): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("content-type", "application/json");
  if (session) headers.set("authorization", `Bearer ${session.token}`);
  const response = await fetch(path, { ...options, headers, cache: "no-store" });
  const result = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(result.error || "The secure request failed");
  return result;
}

function invitationFrom(value: string) {
  const url = new URL(value.trim(), window.location.origin);
  const code = (url.searchParams.get("room") || "").toUpperCase();
  const secret = new URLSearchParams(url.hash.slice(1)).get("k") || "";
  if (!/^[A-Z2-9]{5}-[A-Z2-9]{5}$/u.test(code) || secret.length < 40) throw new Error("Paste the complete CipherDrop invitation link");
  return { code, secret };
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

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteLink, setInviteLink] = useState("");
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

  const sessionRef = useRef<Session | null>(null);
  const cipherRef = useRef<SessionCipher | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const lastEventRef = useRef(0);
  const guestHandshakeRef = useRef<{ publicKey: string; mac: string } | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const currentSendRef = useRef<{ file: File; offer: FileOffer } | null>(null);
  const receiveRef = useRef<{ offer: FileOffer; chunks: ArrayBuffer[]; bytes: number } | null>(null);
  const handleSignalRef = useRef<(event: SignalEvent) => Promise<void>>(async () => undefined);
  const handleControlRef = useRef<(message: Record<string, unknown>) => Promise<void>>(async () => undefined);
  const iceServersRef = useRef<RTCIceServer[]>(defaultIceServers);

  useEffect(() => { sessionRef.current = session; }, [session]);

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
      setRelayAvailable(result.relayAvailable);
    } catch {
      iceServersRef.current = defaultIceServers;
      setRelayAvailable(false);
    }
  };

  const attachChannel = useCallback((channel: RTCDataChannel) => {
    channelRef.current = channel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = 512 * 1024;
    channel.onopen = () => {
      setConnected(true);
      setPhase("Encrypted peer connection established");
      if (cipherRef.current) setSafetyCode(cipherRef.current.safetyCode);
    };
    channel.onclose = () => {
      setConnected(false);
      setPhase("The private connection ended");
    };
    channel.onerror = () => setError("The encrypted data channel reported an error");
    channel.onmessage = async (event) => {
      try {
        const cipher = cipherRef.current;
        if (!cipher) throw new Error("Encryption keys are unavailable");
        if (typeof event.data === "string") {
          await handleControlRef.current(await cipher.decryptControl(event.data));
          return;
        }
        const chunk = await cipher.decryptChunk(event.data as ArrayBuffer);
        const receiving = receiveRef.current;
        if (!receiving) throw new Error("Unexpected encrypted file data");
        receiving.chunks.push(chunk);
        receiving.bytes += chunk.byteLength;
        setTransfer({
          name: receiving.offer.name,
          direction: "receiving",
          progress: Math.min(100, (receiving.bytes / receiving.offer.size) * 100),
          detail: `${formatBytes(receiving.bytes)} of ${formatBytes(receiving.offer.size)}`,
        });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Encrypted packet verification failed");
      }
    };
  }, []);

  const setupPeer = useCallback((role: Role) => {
    peerRef.current?.close();
    const peer = new RTCPeerConnection({ iceServers: iceServersRef.current });
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
    });
    cipherRef.current = cipher;
    setSafetyCode(cipher.safetyCode);
    return cipher;
  }, []);

  const createRoom = async () => {
    setBusy(true); setError("");
    try {
      const secret = createInvitationSecret();
      const ephemeral = await createEphemeralKeyPair();
      const created = await api<{ code: string; token: string; expiresAt: number }>("/api/sessions", { method: "POST" });
      const next: Session = { ...created, role: "host", secret, ...ephemeral };
      sessionRef.current = next;
      setSession(next);
      await loadIceConfig(next);
      setInviteLink(`${window.location.origin}/?room=${encodeURIComponent(created.code)}#k=${secret}`);
      setPhase("Waiting for one trusted person");
      lastEventRef.current = 0;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create room"); }
    finally { setBusy(false); }
  };

  const joinRoom = async () => {
    setBusy(true); setError("");
    try {
      const parsed = invitationFrom(inviteInput);
      const ephemeral = await createEphemeralKeyPair();
      const joined = await api<{ code: string; token: string; expiresAt: number }>(`/api/sessions/${parsed.code}/join`, { method: "POST" });
      const next: Session = { ...joined, role: "guest", secret: parsed.secret, ...ephemeral };
      sessionRef.current = next;
      setSession(next);
      await loadIceConfig(next);
      setPhase("Connection request sent");
      lastEventRef.current = 0;
      const mac = await authenticateHandshake(parsed.secret, `guest-key|${parsed.code}|${ephemeral.publicKey}`);
      await sendSignal("guest-key", { publicKey: ephemeral.publicKey, mac }, next);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not join room"); }
    finally { setBusy(false); }
  };

  const acceptPeer = async () => {
    const target = sessionRef.current;
    const guest = guestHandshakeRef.current;
    if (!target || target.role !== "host" || !guest) return;
    setBusy(true); setError("");
    try {
      const expected = await authenticateHandshake(target.secret, `guest-key|${target.code}|${guest.publicKey}`);
      if (!constantTimeEqual(expected, guest.mac)) throw new Error("The invitation authentication check failed");
      await deriveCipher(target, guest.publicKey, target.publicKey, guest.publicKey);
      const mac = await authenticateHandshake(target.secret, `accept|${target.code}|${target.publicKey}|${guest.publicKey}`);
      await sendSignal("accept", { publicKey: target.publicKey, guestPublicKey: guest.publicKey, mac });
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
      guestHandshakeRef.current = { publicKey: String(event.payload.publicKey), mac: String(event.payload.mac) };
      setGuestKeyReady(true); return;
    }
    if (event.type === "reject") { setPhase("The connection request was rejected"); return; }
    if (event.type === "accept" && target.role === "guest") {
      const hostPublicKey = String(event.payload.publicKey);
      const guestPublicKey = String(event.payload.guestPublicKey);
      const mac = String(event.payload.mac);
      if (guestPublicKey !== target.publicKey) throw new Error("Handshake identity mismatch");
      const expected = await authenticateHandshake(target.secret, `accept|${target.code}|${hostPublicKey}|${guestPublicKey}`);
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
    if (event.type === "leave") { setConnected(false); setPhase("The other person ended the session"); }
  };

  useEffect(() => { handleSignalRef.current = handleSignal; });

  useEffect(() => {
    if (!session) return;
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
  }, [session]);

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
    if (!selectedFile) return;
    setBusy(true); setError("");
    try {
      if (selectedFile.size > MAX_FILE_SIZE) throw new Error("This version accepts files up to 100 MB to protect browser memory");
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
    if (!incomingFile) return;
    receiveRef.current = { offer: incomingFile, chunks: [], bytes: 0 };
    setTransfer({ name: incomingFile.name, direction: "receiving", progress: 0, detail: "Encrypted transfer starting" });
    await sendControl({ type: "file-accept", id: incomingFile.id });
    setIncomingFile(null);
  };

  const finishReceivedFile = async (id: string) => {
    const receiving = receiveRef.current;
    if (!receiving || receiving.offer.id !== id) throw new Error("File completion message did not match the active transfer");
    if (receiving.bytes !== receiving.offer.size) throw new Error("The received file size did not match");
    const blob = new Blob(receiving.chunks, { type: receiving.offer.type });
    const actualHash = await sha256(await blob.arrayBuffer());
    if (!constantTimeEqual(actualHash, receiving.offer.hash)) throw new Error("File integrity verification failed");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeFilename(receiving.offer.name);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setTransfer({ name: receiving.offer.name, direction: "receiving", progress: 100, detail: "Verified and downloaded" });
    await sendControl({ type: "receipt", id, verified: true });
    receiveRef.current = null;
  };

  const handleControl = async (message: Record<string, unknown>) => {
    const type = String(message.type || "");
    if (type === "file-offer") {
      const offer = message.offer as unknown as FileOffer;
      if (!offer || offer.size < 0 || offer.size > MAX_FILE_SIZE || offer.name.length > 255) throw new Error("Unsafe file offer rejected");
      setIncomingFile(offer); return;
    }
    if (type === "file-accept") {
      const sending = currentSendRef.current;
      if (sending && sending.offer.id === message.id) void transmitFile(sending.file, sending.offer);
      return;
    }
    if (type === "file-reject") { setTransfer(null); setFileOfferPending(false); currentSendRef.current = null; setPhase("The file was declined"); return; }
    if (type === "file-complete") { await finishReceivedFile(String(message.id)); return; }
    if (type === "receipt" && message.verified) {
      setTransfer((value) => value ? { ...value, progress: 100, detail: "Receiver verified the complete file" } : value);
      currentSendRef.current = null;
      setFileOfferPending(false);
    }
  };

  useEffect(() => { handleControlRef.current = handleControl; });

  const endSession = async () => {
    const target = sessionRef.current;
    if (target) {
      try { await sendSignal("leave", {}, target); } catch { /* best effort */ }
      try { await api(`/api/sessions/${target.code}/close?role=${target.role}`, { method: "POST" }, target); } catch { /* TTL cleanup remains */ }
    }
    channelRef.current?.close(); peerRef.current?.close();
    channelRef.current = null; peerRef.current = null; cipherRef.current = null; sessionRef.current = null;
    setSession(null); setConnected(false); setIncomingRequest(false); setSelectedFile(null); setIncomingFile(null); setTransfer(null); setFileOfferPending(false); setRelayAvailable(false); setSafetyCode("");
    setPhase("Session destroyed"); setInviteLink(""); window.history.replaceState({}, "", window.location.pathname);
  };

  useEffect(() => {
    const close = () => { peerRef.current?.close(); channelRef.current?.close(); };
    window.addEventListener("pagehide", close);
    return () => window.removeEventListener("pagehide", close);
  }, []);

  const copyInvite = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setPhase("Private invitation copied");
  };

  return (
    <main className="shell">
      <nav className="nav" aria-label="Main navigation">
        <button className="brand brand-button" onClick={() => { if (!session) window.location.assign("/"); }} aria-label="CipherDrop home">
          <span className="brand-mark" aria-hidden="true">C</span><span>CipherDrop</span>
        </button>
        <span className="privacy-pill"><span className="live-dot" /> End-to-end encrypted</span>
      </nav>

      {!session ? (
        <section className="hero">
          <div className="eyebrow"><span>PRIVATE BY DESIGN</span><i /></div>
          <h1>Send files.<br /><em>Leave no trace.</em></h1>
          <p className="hero-copy">A temporary, direct connection between two devices. Files are encrypted before they leave your browser and the session disappears when you do.</p>
          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className="action-grid">
            <article className="action-card primary-card">
              <div className="card-number">01</div>
              <div><h2>Create a secure room</h2><p>Get a one-time private invitation for someone you trust.</p></div>
              <button className="primary-button" type="button" onClick={createRoom} disabled={busy}>{busy ? "Creating…" : "Create private room"}<span aria-hidden="true">→</span></button>
            </article>
            <article className="action-card">
              <div className="card-number">02</div>
              <div><h2>Join with an invite</h2><p>Paste the full link. Its secret stays inside your browser.</p></div>
              <div className="join-row">
                <label className="sr-only" htmlFor="invite">Private invitation link</label>
                <input id="invite" value={inviteInput} onChange={(event) => setInviteInput(event.target.value)} placeholder="Paste invitation link" autoComplete="off" spellCheck={false} />
                <button type="button" onClick={joinRoom} disabled={busy || !inviteInput} aria-label="Join secure room">→</button>
              </div>
            </article>
          </div>
        </section>
      ) : (
        <section className="room-layout">
          <header className="room-header">
            <div><div className="eyebrow"><span>ONE-TIME ROOM</span><i /></div><h1 className="room-title">Private channel</h1></div>
            <button className="end-button" onClick={endSession}>End & destroy session</button>
          </header>

          {error && <div className="error-banner" role="alert">{error}</div>}
          <div className="status-strip"><span className={connected ? "status-orb connected" : "status-orb"} /><strong>{phase}</strong><span className="room-code">{session.code}</span></div>

          {session.role === "host" && !connected && (
            <section className="invite-panel">
              <div><span className="section-kicker">PRIVATE INVITATION</span><h2>Invite exactly one person</h2><p>The secret after # never goes to our server. Share this link through a trusted channel.</p></div>
              <div className="copy-row"><input value={inviteLink} readOnly aria-label="Private invitation link" /><button onClick={copyInvite}>Copy link</button></div>
            </section>
          )}

          {incomingRequest && (
            <section className="request-card" aria-live="polite">
              <div className="request-icon">↗</div><div><span className="section-kicker">CONNECTION REQUEST</span><h2>Someone opened your private invite</h2><p>Accept only if you are expecting this person.</p></div>
              <div className="request-actions"><button className="ghost-button" onClick={rejectPeer}>Reject</button><button className="solid-button" onClick={acceptPeer} disabled={!guestKeyReady || busy}>{guestKeyReady ? "Verify & accept" : "Verifying invite…"}</button></div>
            </section>
          )}

          {connected && (
            <div className="workspace-grid">
              <section className="transfer-panel">
                <div className="panel-heading"><div><span className="section-kicker">ENCRYPTED TRANSFER</span><h2>Choose a file</h2></div><span className="limit-pill">MAX 100 MB</span></div>
                <label className="drop-zone">
                  <input type="file" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} />
                  <span className="drop-icon">＋</span>
                  {selectedFile ? <><strong>{selectedFile.name}</strong><small>{formatBytes(selectedFile.size)}</small></> : <><strong>Select a file to send</strong><small>It never uploads to CipherDrop</small></>}
                </label>
                <button className="primary-button send-button" onClick={offerSelectedFile} disabled={!selectedFile || busy || fileOfferPending}>Encrypt & offer file <span>→</span></button>

                {incomingFile && (
                  <div className="file-offer">
                    <div><span className="section-kicker">INCOMING FILE</span><strong>{incomingFile.name}</strong><small>{formatBytes(incomingFile.size)} · approve before download</small></div>
                    <div><button className="ghost-button" onClick={() => { void sendControl({ type: "file-reject", id: incomingFile.id }); setIncomingFile(null); }}>Decline</button><button className="solid-button" onClick={acceptFile}>Accept</button></div>
                  </div>
                )}

                {transfer && (
                  <div className="progress-card" aria-live="polite">
                    <div className="progress-copy"><strong>{transfer.direction === "sending" ? "Sending" : "Receiving"} {transfer.name}</strong><span>{Math.round(transfer.progress)}%</span></div>
                    <div className="progress-track"><i style={{ width: `${transfer.progress}%` }} /></div><small>{transfer.detail}</small>
                  </div>
                )}
              </section>

              <aside className="security-panel">
                <span className="section-kicker">VERIFIED SESSION</span><h2>Safety code</h2><div className="safety-code">{safetyCode}</div>
                <p>Compare this code with the other person. Matching codes confirm the signaling service did not replace your encryption keys.</p>
                <ul><li><span>✓</span>AES-256-GCM per chunk</li><li><span>✓</span>Ephemeral ECDH keys</li><li><span>✓</span>Authenticated invitation secret</li><li><span>✓</span>No server file storage</li><li><span>{relayAvailable ? "✓" : "○"}</span>{relayAvailable ? "TURN relay fallback ready" : "Direct connection mode"}</li></ul>
              </aside>
            </div>
          )}
        </section>
      )}

      <section className="assurance" aria-label="Security details">
        <div><strong>AES-256-GCM</strong><span>Authenticated file encryption</span></div>
        <div><strong>Ephemeral keys</strong><span>Destroyed on exit</span></div>
        <div><strong>Zero file storage</strong><span>Browser-to-browser transfer</span></div>
      </section>
    </main>
  );
}
