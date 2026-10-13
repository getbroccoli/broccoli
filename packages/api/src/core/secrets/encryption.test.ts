import { expect, it } from "vitest";

import { createEncryption } from ".";

const key = Buffer.alloc(32, 1).toString("base64url");

it("decrypts an encrypted secret", () => {
  const encryption = createEncryption(key);

  expect(encryption.decrypt(encryption.encrypt("test-token-🌱"))).toBe("test-token-🌱");
});

it("encrypts the same plaintext differently each time", () => {
  const encryption = createEncryption(key);

  expect(encryption.encrypt("test-token")).not.toBe(encryption.encrypt("test-token"));
});

it("refuses a tampered ciphertext", () => {
  const encryption = createEncryption(key);
  const ciphertext = Buffer.from(encryption.encrypt("test-token"), "base64url");
  ciphertext[ciphertext.length - 1] = ciphertext[ciphertext.length - 1]! ^ 1;

  expect(() => encryption.decrypt(ciphertext.toString("base64url"))).toThrow();
});

it("refuses ciphertext encrypted with another key", () => {
  const encryption = createEncryption(key);
  const other = createEncryption(Buffer.alloc(32, 2).toString("base64url"));

  expect(() => other.decrypt(encryption.encrypt("test-token"))).toThrow();
});
