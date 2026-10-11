import { expect, it } from "vitest";

import { generatePassword, PASSWORD_ALPHABET } from "./generatePassword";

it("returns 20 characters from the alphabet", () => {
  const password = generatePassword();

  expect(password).toHaveLength(20);
  expect([...password].every((character) => PASSWORD_ALPHABET.includes(character))).toBe(true);
});

it("leaves out look-alike characters", () => {
  expect(PASSWORD_ALPHABET).not.toMatch(/[0Oo1lI]/);
});

it("maps each random byte to one character", () => {
  const sequence = [0, 1, 55, 56, 223];
  let offset = 0;
  const random = (bytes: Uint8Array) => {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = sequence[offset++ % sequence.length]!;
    }
    return bytes;
  };

  const password = generatePassword(random);

  expect(password).toBe("AB9A9AB9A9AB9A9AB9A9");
});

it("skips bytes at or above the cut-off instead of wrapping them", () => {
  const sequence = [224, 0, 255, 1, 223];
  let offset = 0;
  const random = (bytes: Uint8Array) => {
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = sequence[offset++ % sequence.length]!;
    }
    return bytes;
  };

  const password = generatePassword(random);

  expect(password).toBe("AB9AB9AB9AB9AB9AB9AB");
});
