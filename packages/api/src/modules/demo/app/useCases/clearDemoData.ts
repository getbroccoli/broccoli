import { type Actor, requireOwner } from "../../../../core/actor";
import { runInTransaction } from "../../../../core/db";
import { clearDemoEmployees } from "../../../employees";
import type { DemoContext } from "./demoContext";

/** Deletes every demo record; records people added stay. */
export async function clearDemoData({ orm, eventBus }: DemoContext, actor: Actor) {
  requireOwner(actor);
  await runInTransaction(orm, eventBus, (tx) => clearDemoEmployees(tx));
  return { isPresent: false };
}
