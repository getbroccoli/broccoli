import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { InvalidTokenError } from "../domain";
import { verifyToken } from "./verifyToken";

const ISSUER = "https://accounts.example.com";
const AUDIENCE = "instance:slot-1";
const NOW = 1_800_000_000;
let keys: ReturnType<typeof createLocalJWKSet>;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

beforeAll(async () => {
  const pair = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  privateKey = pair.privateKey;
  keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "company" }] });
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW * 1000);
});

afterEach(() => vi.useRealTimers());

function sign(overrides: JWTPayload = {}) {
  return new SignJWT({
    purpose: "init",
    iss: ISSUER,
    aud: AUDIENCE,
    iat: NOW,
    exp: NOW + 60,
    ...overrides,
  })
    .setProtectedHeader({ alg: "EdDSA", kid: "company" })
    .sign(privateKey);
}

it("returns the payload of a valid token", async () => {
  const payload = await verifyToken(await sign(), { keys, issuer: ISSUER, audience: AUDIENCE });
  expect(payload.purpose).toBe("init");
});

it.each([
  ["another issuer", { iss: "https://other.example.com" }],
  ["another audience", { aud: "instance:slot-2" }],
  ["a lifetime over 60 seconds", { exp: NOW + 61 }],
  ["a zero lifetime", { exp: NOW }],
  ["a negative lifetime", { exp: NOW - 1 }],
  ["an expired token", { iat: NOW - 120, exp: NOW - 60 }],
  ["an issue time beyond the clock tolerance", { iat: NOW + 6, exp: NOW + 60 }],
  ["a missing issue time", { iat: undefined }],
  ["a missing expiry", { exp: undefined }],
  ["a fractional issue time", { iat: NOW + 0.5 }],
  ["a fractional expiry", { exp: NOW + 59.5 }],
])("refuses %s", async (_kind, options) => {
  await expect(
    verifyToken(await sign(options), { keys, issuer: ISSUER, audience: AUDIENCE }),
  ).rejects.toBeInstanceOf(InvalidTokenError);
});

it("allows an issue time within the five-second clock tolerance", async () => {
  const token = await sign({ iat: NOW + 5, exp: NOW + 60 });

  await expect(
    verifyToken(token, { keys, issuer: ISSUER, audience: AUDIENCE }),
  ).resolves.toMatchObject({ purpose: "init" });
});

it("refuses a signature from another key", async () => {
  const other = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const token = await new SignJWT({ iss: ISSUER, aud: AUDIENCE, iat: NOW, exp: NOW + 60 })
    .setProtectedHeader({ alg: "EdDSA", kid: "company" })
    .sign(other.privateKey);

  await expect(
    verifyToken(token, { keys, issuer: ISSUER, audience: AUDIENCE }),
  ).rejects.toBeInstanceOf(InvalidTokenError);
});

it("refuses a token that is not a JWT", async () => {
  await expect(
    verifyToken("not-a-token", { keys, issuer: ISSUER, audience: AUDIENCE }),
  ).rejects.toBeInstanceOf(InvalidTokenError);
});

it("refuses a signing algorithm other than EdDSA", async () => {
  const pair = await generateKeyPair("ES256");
  const otherKeys = createLocalJWKSet({ keys: [await exportJWK(pair.publicKey)] });
  const token = await new SignJWT({ iss: ISSUER, aud: AUDIENCE, iat: NOW, exp: NOW + 60 })
    .setProtectedHeader({ alg: "ES256" })
    .sign(pair.privateKey);

  await expect(
    verifyToken(token, { keys: otherKeys, issuer: ISSUER, audience: AUDIENCE }),
  ).rejects.toBeInstanceOf(InvalidTokenError);
});

it("passes on a failure to read the keys", async () => {
  const failingKeys = () => Promise.reject(new TypeError("fetch failed"));
  await expect(
    verifyToken(await sign(), { keys: failingKeys, issuer: ISSUER, audience: AUDIENCE }),
  ).rejects.toBeInstanceOf(TypeError);
});
