import { expect, it } from "vitest";

import { createSecretBox } from ".";

const key = Buffer.alloc(32, 1).toString("base64url");

it("decrypts an encrypted secret", () => {
  const secretBox = createSecretBox(key);

  expect(secretBox.decrypt(secretBox.encrypt("test-token-🌱"))).toBe("test-token-🌱");
});

it("encrypts the same plaintext differently each time", () => {
  const secretBox = createSecretBox(key);

  expect(secretBox.encrypt("test-token")).not.toBe(secretBox.encrypt("test-token"));
});

it("refuses a tampered ciphertext", () => {
  const secretBox = createSecretBox(key);
  const ciphertext = Buffer.from(secretBox.encrypt("test-token"), "base64url");
  ciphertext[ciphertext.length - 1] = ciphertext[ciphertext.length - 1]! ^ 1;

  expect(() => secretBox.decrypt(ciphertext.toString("base64url"))).toThrow();
});

it("refuses ciphertext encrypted with another key", () => {
  const secretBox = createSecretBox(key);
  const other = createSecretBox(Buffer.alloc(32, 2).toString("base64url"));

  expect(() => other.decrypt(secretBox.encrypt("test-token"))).toThrow();
});
