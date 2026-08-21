import assert from "node:assert/strict";
import test from "node:test";
import { validateSignalPayload } from "../src/validation.ts";

const publicKey = "A".repeat(87);
const mac = "B".repeat(43);

test("accepts valid handshake and WebRTC signaling shapes", () => {
  assert.equal(validateSignalPayload("guest-key", { publicKey, mac, mode: "link" }), true);
  assert.equal(validateSignalPayload("accept", { publicKey, guestPublicKey: publicKey, mac }), true);
  assert.equal(validateSignalPayload("offer", { description: { type: "offer", sdp: "v=0" } }), true);
  assert.equal(validateSignalPayload("ice", { candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 } }), true);
});

test("rejects malformed, oversized, and unexpected signaling", () => {
  assert.equal(validateSignalPayload("guest-key", { publicKey: "short", mac, mode: "link" }), false);
  assert.equal(validateSignalPayload("offer", { description: { type: "answer", sdp: "v=0" } }), false);
  assert.equal(validateSignalPayload("ice", { candidate: { candidate: "x".repeat(2_049) } }), false);
  assert.equal(validateSignalPayload("leave", { extra: true }), false);
  assert.equal(validateSignalPayload("unknown", {}), false);
  assert.equal(validateSignalPayload("reject", []), false);
});
