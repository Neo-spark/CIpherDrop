import assert from "node:assert/strict";
import test from "node:test";
import { isTransferDirection, validateSignalPayload } from "../src/validation.ts";

const publicKey = "A".repeat(87);
const mac = "B".repeat(43);
const direction = "host-to-guest";

test("accepts valid handshake and WebRTC signaling shapes", () => {
  assert.equal(validateSignalPayload("guest-key", { publicKey, mac, mode: "link", direction }), true);
  assert.equal(validateSignalPayload("accept", { publicKey, guestPublicKey: publicKey, mac, direction }), true);
  assert.equal(validateSignalPayload("offer", { description: { type: "offer", sdp: "v=0" } }), true);
  assert.equal(validateSignalPayload("ice", { candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0 } }), true);
});

test("rejects malformed, oversized, and unexpected signaling", () => {
  assert.equal(validateSignalPayload("guest-key", { publicKey: "short", mac, mode: "link", direction }), false);
  assert.equal(validateSignalPayload("guest-key", { publicKey, mac, mode: "link", direction: "both" }), false);
  assert.equal(validateSignalPayload("offer", { description: { type: "answer", sdp: "v=0" } }), false);
  assert.equal(validateSignalPayload("ice", { candidate: { candidate: "x".repeat(2_049) } }), false);
  assert.equal(validateSignalPayload("leave", { extra: true }), false);
  assert.equal(validateSignalPayload("unknown", {}), false);
  assert.equal(validateSignalPayload("reject", []), false);
});

test("accepts only immutable one-way transfer directions", () => {
  assert.equal(isTransferDirection("host-to-guest"), true);
  assert.equal(isTransferDirection("guest-to-host"), true);
  assert.equal(isTransferDirection("both"), false);
});
