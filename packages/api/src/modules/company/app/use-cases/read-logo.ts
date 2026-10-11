import { z } from "zod";

import { type Actor, requireOwner } from "../../../../core/actor";
import type { RasterImage } from "../../../../utils";
import type { CompanyContext } from "./company";

/** The current logo; null for an id that is not current, or not an id at all. */
export async function readLogo(
  { companies }: CompanyContext,
  actor: Actor,
  logoId: string,
): Promise<RasterImage | null> {
  requireOwner(actor);
  return z.uuid().safeParse(logoId).success ? companies.readLogo(logoId) : null;
}
