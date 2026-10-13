import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Encrypts credentials that the database stores, such as a Slack token. */
export interface Encryption {
  /** `plaintext` encrypted and authenticated, as base64url. */
  encrypt(plaintext: string): string;
  /** The plaintext of `encrypt`; throws when `encrypted` was changed or encrypted with another key. */
  decrypt(encrypted: string): string;
}

/** Encryption with `key`, a base64url secret of 32 bytes such as `ensureSecret` makes. */
export function createEncryption(key: string): Encryption {
  const keyBytes = Buffer.from(key, "base64url");
  if (keyBytes.length !== KEY_BYTES) {
    throw new Error(`The encryption key must be ${KEY_BYTES} bytes`);
  }
  return {
    encrypt: (plaintext) => {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, keyBytes, iv);
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
    },
    decrypt: (encrypted) => {
      const bytes = Buffer.from(encrypted, "base64url");
      const decipher = createDecipheriv(ALGORITHM, keyBytes, bytes.subarray(0, IV_BYTES));
      decipher.setAuthTag(bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([
        decipher.update(bytes.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]).toString("utf8");
    },
  };
}
