import { z } from "zod";

import { type Actor, requireOwner } from "../../../../core/actor";
import type { Logo } from "../../domain";
import type { CompanyContext } from "./company";

/** The current logo; null for an id that is not current, or not an id at all. */
export async function readLogo(
  { companies }: CompanyContext,
  actor: Actor,
  logoId: string,
): Promise<Logo | null> {
  requireOwner(actor);
  return z.uuid().safeParse(logoId).success ? companies.readLogo(logoId) : null;
}
