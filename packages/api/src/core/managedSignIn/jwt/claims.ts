import type { JWTPayload } from "jose";
import { z } from "zod";

import { parseOrigin } from "../../../utils";
import type { ManagedAssignment } from "../../instance";
import { InvalidAssignmentError, InvalidTokenError, type ManagedTicket } from "../domain";

const MAX_TEXT_LENGTH = 255;
const MAX_EMAIL_LENGTH = 320;

const text = z
  .string()
  .max(MAX_TEXT_LENGTH)
  .refine((value) => !value.includes("\u0000"));

const origin = z.string().transform((raw, context) => {
  const parsed = parseOrigin(raw);
  if (parsed === null) {
    context.addIssue({ code: "custom", message: "Not an origin" });
    return z.NEVER;
  }
  return parsed;
});

const initClaims = z.object({ purpose: z.literal("init"), config: z.unknown() });

const assignmentConfig = z.object({
  companyId: text.min(1),
  publicOrigin: origin,
  websiteOrigin: origin,
});

/** The assignment carried by a verified init token. */
export function parseInitClaims(payload: JWTPayload): ManagedAssignment {
  const claims = initClaims.safeParse(payload);
  if (!claims.success) {
    throw new InvalidTokenError();
  }
  const assignment = assignmentConfig.safeParse(claims.data.config);
  if (!assignment.success) {
    throw new InvalidAssignmentError();
  }
  return assignment.data;
}

const ticketClaims = z.object({
  sub: text.min(1),
  email: z.email().max(MAX_EMAIL_LENGTH),
  name: text,
  company: z.string(),
  state: z.string().regex(/^[a-f0-9]{64}$/),
  jti: z.uuid(),
  exp: z.number().int(),
  // An init token must never pass as a ticket.
  purpose: z.never().optional(),
});

/** The identity and single-use details of a verified sign-in ticket. */
export function parseTicketClaims(payload: JWTPayload): ManagedTicket {
  const claims = ticketClaims.safeParse(payload);
  if (!claims.success) {
    throw new InvalidTokenError();
  }
  const { sub, email, name, company, state, jti, exp } = claims.data;
  return {
    subject: sub,
    email: email.toLowerCase(),
    name,
    company,
    state,
    jti,
    expiresAt: new Date(exp * 1000),
  };
}
