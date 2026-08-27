import assert from "node:assert/strict";
import test from "node:test";
import {
  authenticateHandshake,
  createEphemeralKeyPair,
  createInvitationSecret,
  deriveSessionCipher,
} from "../app/cipher.ts";

test("both peers derive compatible directional encryption keys", async () => {
  const code = "ABCDE-FGHIJ";
  const transferDirection = "host-to-guest";
  const invitationSecret = createInvitationSecret();
  const host = await createEphemeralKeyPair();
  const guest = await createEphemeralKeyPair();

  const hostCipher = await deriveSessionCipher({
    code, role: "host", keyPair: host.keyPair, otherPublicKey: guest.publicKey,
    hostPublicKey: host.publicKey, guestPublicKey: guest.publicKey, invitationSecret, transferDirection,
  });
  const guestCipher = await deriveSessionCipher({
    code, role: "guest", keyPair: guest.keyPair, otherPublicKey: host.publicKey,
    hostPublicKey: host.publicKey, guestPublicKey: guest.publicKey, invitationSecret, transferDirection,
  });

  assert.equal(hostCipher.safetyCode, guestCipher.safetyCode);
  const encryptedControl = await hostCipher.encryptControl({ type: "file-offer", size: 42 });
  assert.deepEqual(await guestCipher.decryptControl(encryptedControl), { type: "file-offer", size: 42 });

  const clearChunk = new TextEncoder().encode("confidential file bytes");
  const encryptedChunk = await guestCipher.encryptChunk(clearChunk.buffer);
  const decryptedChunk = await hostCipher.decryptChunk(encryptedChunk);
  assert.equal(new TextDecoder().decode(decryptedChunk), "confidential file bytes");
});

test("authenticated handshake changes when a public key is replaced", async () => {
  const secret = createInvitationSecret();
  const valid = await authenticateHandshake(secret, "guest-key|ROOM|public-key-a");
  const replaced = await authenticateHandshake(secret, "guest-key|ROOM|public-key-b");
  assert.notEqual(valid, replaced);
});

test("replayed ciphertext is rejected", async () => {
  const code = "ABCDE-FGHIJ";
  const transferDirection = "guest-to-host";
  const invitationSecret = createInvitationSecret();
  const host = await createEphemeralKeyPair();
  const guest = await createEphemeralKeyPair();
  const sender = await deriveSessionCipher({ code, role: "host", keyPair: host.keyPair, otherPublicKey: guest.publicKey, hostPublicKey: host.publicKey, guestPublicKey: guest.publicKey, invitationSecret, transferDirection });
  const receiver = await deriveSessionCipher({ code, role: "guest", keyPair: guest.keyPair, otherPublicKey: host.publicKey, hostPublicKey: host.publicKey, guestPublicKey: guest.publicKey, invitationSecret, transferDirection });
  const packet = await sender.encryptControl({ type: "once" });
  await receiver.decryptControl(packet);
  await assert.rejects(receiver.decryptControl(packet), /Replay detected/);
});

test("peers cannot communicate when the authenticated direction differs", async () => {
  const code = "ABCDE-FGHIJ";
  const invitationSecret = createInvitationSecret();
  const host = await createEphemeralKeyPair();
  const guest = await createEphemeralKeyPair();
  const sender = await deriveSessionCipher({ code, role: "host", keyPair: host.keyPair, otherPublicKey: guest.publicKey, hostPublicKey: host.publicKey, guestPublicKey: guest.publicKey, invitationSecret, transferDirection: "host-to-guest" });
  const receiver = await deriveSessionCipher({ code, role: "guest", keyPair: guest.keyPair, otherPublicKey: host.publicKey, hostPublicKey: host.publicKey, guestPublicKey: guest.publicKey, invitationSecret, transferDirection: "guest-to-host" });
  await assert.rejects(receiver.decryptControl(await sender.encryptControl({ type: "file-offer" })));
});
