import type { SecurityContext } from "../../../../core/security";

/**
 * Who may work on the import, checked first by every import use case: the owner, Broccoli
 * itself, or the setup holder. One place, so the rule can grow per action later.
 */
export function requireImportAccess(ctx: SecurityContext): void {
  ctx.requireSetupAccess("MANAGE_WORKSPACE");
}
