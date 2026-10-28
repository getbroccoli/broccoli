import type { SecurityContext } from "../../../../core/security";
import { hasDemoEmployees } from "../../../employees";
import type { DemoContext } from "./demoContext";

/** Whether the instance holds demo data. */
export async function getDemoData({ orm }: DemoContext, ctx: SecurityContext) {
  ctx.require("MANAGE_WORKSPACE");
  return { isPresent: await hasDemoEmployees(ctx, orm) };
}
