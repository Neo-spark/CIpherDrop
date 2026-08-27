import assert from "node:assert/strict";
import test from "node:test";
import {
  fitsReceivedTray,
  previewKindFor,
  RECEIVED_TRAY_LIMIT,
  senderRole,
  TEXT_PREVIEW_LIMIT,
} from "../lib/transfer-session.ts";

test("maps the immutable direction to exactly one sender", () => {
  assert.equal(senderRole("host-to-guest"), "host");
  assert.equal(senderRole("guest-to-host"), "guest");
});

test("allows only explicitly supported passive previews", () => {
  assert.equal(previewKindFor("photo.png", "image/png", 20), "image");
  assert.equal(previewKindFor("document.pdf", "application/pdf", 20), "pdf");
  assert.equal(previewKindFor("notes.txt", "text/plain", 20), "text");
  assert.equal(previewKindFor("song.mp3", "audio/mpeg", 20), "audio");
  assert.equal(previewKindFor("clip.mp4", "video/mp4", 20), "video");
  assert.equal(previewKindFor("active.svg", "image/svg+xml", 20), null);
  assert.equal(previewKindFor("page.html", "text/html", 20), null);
  assert.equal(previewKindFor("fake.png", "text/html", 20), null);
  assert.equal(previewKindFor("large.txt", "text/plain", TEXT_PREVIEW_LIMIT + 1), null);
});

test("enforces the combined received-file memory limit", () => {
  assert.equal(fitsReceivedTray(40, 20, RECEIVED_TRAY_LIMIT - 60), true);
  assert.equal(fitsReceivedTray(40, 20, RECEIVED_TRAY_LIMIT - 59), false);
  assert.equal(fitsReceivedTray(-1, 0, 1), false);
});
