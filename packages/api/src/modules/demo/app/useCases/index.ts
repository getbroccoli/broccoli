import type { SecurityContext } from "../../../../core/security";
import { clearDemoData } from "./clearDemoData";
import type { DemoContext } from "./demoContext";
import { getDemoData } from "./getDemoData";

export { prepareDemoFill } from "./prepareDemoFill";

/** Everything that can be done with demo data; the adapters call nothing else. */
export interface DemoUseCases {
  clearDemoData: (ctx: SecurityContext) => Promise<{ isPresent: boolean }>;
  getDemoData: (ctx: SecurityContext) => Promise<{ isPresent: boolean }>;
}

export function createDemoUseCases(context: DemoContext): DemoUseCases {
  return {
    clearDemoData: (ctx: SecurityContext) => clearDemoData(context, ctx),
    getDemoData: (ctx: SecurityContext) => getDemoData(context, ctx),
  };
}
