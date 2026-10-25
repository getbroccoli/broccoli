import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";

import { startFakeHttpServer } from "./fakeHttpServer";

export const MANAGED_INSTANCE_ID = "slot-1";
export const MANAGED_INSTANCE_CREDENTIAL = `ib_${"a".repeat(64)}`;

export const MANAGED_ASSIGNMENT = {
  companyId: "c-acme",
  publicOrigin: "https://acme.example.com",
  websiteOrigin: "https://www.example.com",
};

interface SignOptions {
  issuer?: string;
  audience?: string;
  lifetimeSeconds?: number;
  issuedAt?: number;
  expiresAt?: number;
}

/** The accounts service: an Ed25519 key, its JWKS, and signed init tokens and tickets. */
export async function startFakeAccounts() {
  const { publicKey, privateKey } = await generateKeyPair("EdDSA", { crv: "Ed25519" });
  const jwk = { ...(await exportJWK(publicKey)), kid: "company", alg: "EdDSA", use: "sig" };
  const server = await startFakeHttpServer((path) =>
    path === "/.well-known/jwks.json" ? { status: 200, body: { keys: [jwk] } } : { status: 404 },
  );

  function sign(claims: JWTPayload, audience: string, options: SignOptions) {
    const issuedAt = options.issuedAt ?? Math.floor(Date.now() / 1000);
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "EdDSA", kid: "company" })
      .setIssuer(options.issuer ?? server.url)
      .setAudience(options.audience ?? audience)
      .setIssuedAt(issuedAt)
      .setExpirationTime(options.expiresAt ?? issuedAt + (options.lifetimeSeconds ?? 60))
      .sign(privateKey);
  }

  let stopping: Promise<void> | undefined;
  return {
    url: server.url,
    signInit: (options: SignOptions & { config?: object; purpose?: string } = {}) =>
      sign(
        {
          purpose: options.purpose ?? "init",
          config: options.config ?? {
            ...MANAGED_ASSIGNMENT,
            instanceCredential: MANAGED_INSTANCE_CREDENTIAL,
          },
        },
        `instance:${MANAGED_INSTANCE_ID}`,
        options,
      ),
    signTicket: (claims: JWTPayload, options: SignOptions = {}) =>
      sign(claims, MANAGED_ASSIGNMENT.publicOrigin, options),
    stop: () => (stopping ??= server.stop()),
  };
}

export type FakeAccounts = Awaited<ReturnType<typeof startFakeAccounts>>;
