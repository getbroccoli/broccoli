import type { SecurityContext } from "../../../../core/security";
import type { CalendarDate } from "../../../../utils";
import { clearDemoData } from "./clearDemoData";
import type { DemoContext } from "./demoContext";
import { getDemoData } from "./getDemoData";
import { seedDemoData } from "./seedDemoData";

/** Everything that can be done with demo data; the adapters call nothing else. */
export interface DemoUseCases {
  seedDemoData: (ctx: SecurityContext, today: CalendarDate) => Promise<void>;
  clearDemoData: (ctx: SecurityContext) => Promise<{ isPresent: boolean }>;
  getDemoData: (ctx: SecurityContext) => Promise<{ isPresent: boolean }>;
}

export function createDemoUseCases(context: DemoContext): DemoUseCases {
  return {
    seedDemoData: (ctx: SecurityContext, today: CalendarDate) => seedDemoData(context, ctx, today),
    clearDemoData: (ctx: SecurityContext) => clearDemoData(context, ctx),
    getDemoData: (ctx: SecurityContext) => getDemoData(context, ctx),
  };
}
