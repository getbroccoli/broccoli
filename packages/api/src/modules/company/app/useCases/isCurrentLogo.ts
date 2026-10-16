import type { SecurityContext } from "../../../../core/security";
import type { CompanyContext } from "./company";

/** Whether this is the file id of the current logo. */
export async function isCurrentLogo(
  { companies }: CompanyContext,
  ctx: SecurityContext,
  fileId: string,
): Promise<boolean> {
  ctx.requireSetupAccess();
  return (await companies.read()).logoFileId === fileId;
}
