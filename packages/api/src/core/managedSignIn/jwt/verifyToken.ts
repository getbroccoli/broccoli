import { errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

import { InvalidTokenError } from "../domain";

const MAX_LIFETIME_SECONDS = 60;
const CLOCK_SKEW_SECONDS = 5;

export interface TokenCheck {
  keys: JWTVerifyGetKey;
  issuer: string;
  audience: string;
}

/**
 * The payload of `token` when the issuer's key signed it with EdDSA for `audience`
 * and it lives at most a minute. Throws `InvalidTokenError` for any bad token; a
 * failure to read the keys passes through, so callers can answer "unavailable".
 */
export async function verifyToken(
  token: string,
  { keys, issuer, audience }: TokenCheck,
): Promise<JWTPayload> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      algorithms: ["EdDSA"],
      issuer,
      audience,
      requiredClaims: ["iat", "exp"],
      maxTokenAge: MAX_LIFETIME_SECONDS,
      clockTolerance: CLOCK_SKEW_SECONDS,
    }));
  } catch (error) {
    if (isTokenError(error)) {
      throw new InvalidTokenError();
    }
    throw error;
  }
  if (!hasValidLifetime(payload)) {
    throw new InvalidTokenError();
  }
  return payload;
}

function hasValidLifetime({ iat, exp }: JWTPayload): boolean {
  if (!Number.isInteger(iat) || !Number.isInteger(exp)) {
    return false;
  }
  const lifetime = exp! - iat!;
  return lifetime > 0 && lifetime <= MAX_LIFETIME_SECONDS;
}

/** Errors about the token itself; any other error means its keys could not be read. */
const TOKEN_ERRORS = [
  errors.JWTClaimValidationFailed,
  errors.JWTExpired,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWKSNoMatchingKey,
  errors.JWKSMultipleMatchingKeys,
];

function isTokenError(error: unknown): boolean {
  return TOKEN_ERRORS.some((tokenError) => error instanceof tokenError);
}
