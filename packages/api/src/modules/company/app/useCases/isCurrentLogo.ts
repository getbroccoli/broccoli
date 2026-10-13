import { type Actor, requireOwner } from "../../../../core/actor";
import type { CompanyContext } from "./company";

/** Whether this is the file id of the current logo. */
export async function isCurrentLogo(
  { companies }: CompanyContext,
  actor: Actor,
  fileId: string,
): Promise<boolean> {
  requireOwner(actor);
  return (await companies.read()).logoFileId === fileId;
}
