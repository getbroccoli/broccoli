import type { Actor } from "../../../../core/actor";
import type { CalendarDate } from "../../../../utils";
import { clearDemoData } from "./clearDemoData";
import type { DemoContext } from "./demoContext";
import { getDemoData } from "./getDemoData";
import { seedDemoData } from "./seedDemoData";

/** Everything that can be done with demo data; the adapters call nothing else. */
export function createDemoUseCases(context: DemoContext) {
  return {
    seedDemoData: (today: CalendarDate) => seedDemoData(context, today),
    clearDemoData: (actor: Actor) => clearDemoData(context, actor),
    getDemoData: (actor: Actor) => getDemoData(context, actor),
  };
}

export type DemoUseCases = ReturnType<typeof createDemoUseCases>;
