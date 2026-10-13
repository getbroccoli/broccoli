import { type Actor, requireOwner } from "../../../../core/actor";
import { hasDemoEmployees } from "../../../employees";
import type { DemoContext } from "./demoContext";

/** Whether the instance holds demo data. */
export async function getDemoData({ orm }: DemoContext, actor: Actor) {
  requireOwner(actor);
  return { isPresent: await hasDemoEmployees(orm) };
}
