import { expect, it } from "vitest";

import { createSecretBox } from ".";

const key = Buffer.alloc(32, 1).toString("base64url");

it("opens a sealed secret", () => {
  const box = createSecretBox(key);

  expect(box.open(box.seal("test-token-🌱"))).toBe("test-token-🌱");
});

it("seals the same plaintext differently each time", () => {
  const box = createSecretBox(key);

  expect(box.seal("test-token")).not.toBe(box.seal("test-token"));
});

it("refuses a tampered ciphertext", () => {
  const box = createSecretBox(key);
  const ciphertext = Buffer.from(box.seal("test-token"), "base64url");
  ciphertext[ciphertext.length - 1] = ciphertext[ciphertext.length - 1]! ^ 1;

  expect(() => box.open(ciphertext.toString("base64url"))).toThrow();
});

it("refuses ciphertext sealed with another key", () => {
  const box = createSecretBox(key);
  const otherBox = createSecretBox(Buffer.alloc(32, 2).toString("base64url"));

  expect(() => otherBox.open(box.seal("test-token"))).toThrow();
});
