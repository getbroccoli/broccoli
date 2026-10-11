/** Letters and digits without the look-alikes `0 O o 1 l I`. */
export const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

const PASSWORD_LENGTH = 20;
// Bytes from here up would favour the first characters of the alphabet, so they are skipped.
const UNBIASED_BYTE_LIMIT = 256 - (256 % PASSWORD_ALPHABET.length);

/** Fills `bytes` with random values and returns them, like `crypto.getRandomValues`. */
type RandomSource = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array;

/** A 20-character password, every character equally likely. */
export function generatePassword(
  random: RandomSource = (bytes) => crypto.getRandomValues(bytes),
): string {
  let password = "";
  while (password.length < PASSWORD_LENGTH) {
    for (const byte of random(new Uint8Array(PASSWORD_LENGTH))) {
      if (byte < UNBIASED_BYTE_LIMIT && password.length < PASSWORD_LENGTH) {
        password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      }
    }
  }
  return password;
}
