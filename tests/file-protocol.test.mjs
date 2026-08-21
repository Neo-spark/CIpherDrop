import assert from "node:assert/strict";
import test from "node:test";
import {
  CHUNK_SIZE,
  isBlockedExecutable,
  MAX_FILE_SIZE,
  validateFileOffer,
} from "../lib/file-protocol.ts";

function validOffer(overrides = {}) {
  const size = overrides.size ?? CHUNK_SIZE + 1;
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    name: "report.pdf",
    size,
    type: "application/pdf",
    hash: "A".repeat(43),
    chunks: Math.ceil(size / CHUNK_SIZE),
    ...overrides,
  };
}

test("accepts a bounded, internally consistent file offer", () => {
  assert.equal(validateFileOffer(validOffer({ size: MAX_FILE_SIZE })), true);
});

test("rejects offers that can bypass receiver memory bounds", () => {
  assert.equal(validateFileOffer(validOffer({ size: MAX_FILE_SIZE + 1 })), false);
  assert.equal(validateFileOffer(validOffer({ chunks: 999 })), false);
  assert.equal(validateFileOffer(validOffer({ hash: "invalid" })), false);
  assert.equal(validateFileOffer(validOffer({ name: "" })), false);
});

test("blocks common executable and script file extensions", () => {
  assert.equal(isBlockedExecutable("invoice.pdf.exe"), true);
  assert.equal(isBlockedExecutable("setup.MSI"), true);
  assert.equal(isBlockedExecutable("report.pdf"), false);
});
