import type { SecurityContext } from "../../../../core/security";
import { createEmployeeSetupService } from "../../../employees";
import type { DemoContext } from "./demoContext";

const employeeSetup = createEmployeeSetupService();

/** Whether the instance holds demo data. */
export async function getDemoData({ orm }: DemoContext, ctx: SecurityContext) {
  ctx.require("MANAGE_WORKSPACE");
  return { isPresent: await employeeSetup.hasDemoEmployees(ctx, orm) };
}
