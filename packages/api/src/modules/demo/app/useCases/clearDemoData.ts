import type { SecurityContext } from "../../../../core/security";
import { clearDemoEmployees } from "../../../employees";
import type { DemoContext } from "./demoContext";

/** Deletes every demo record; records people added stay. */
export async function clearDemoData({ transact }: DemoContext, ctx: SecurityContext) {
  ctx.requireOwnerOrSystem();
  await transact((tx) => clearDemoEmployees(ctx, tx));
  return { isPresent: false };
}
