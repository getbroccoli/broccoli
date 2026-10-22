import type { SecurityContext } from "../../../../core/security";
import type { DemoContext } from "./demoContext";
import { exitDemo } from "./exitDemo";
import { getDemoData } from "./getDemoData";

export { prepareDemoFill } from "./prepareDemoFill";

/** Everything that can be done with demo data; the adapters call nothing else. */
export interface DemoUseCases {
  exitDemo: (ctx: SecurityContext) => Promise<{ isPresent: boolean }>;
  getDemoData: (ctx: SecurityContext) => Promise<{ isPresent: boolean }>;
}

export function createDemoUseCases(context: DemoContext): DemoUseCases {
  return {
    exitDemo: (ctx: SecurityContext) => exitDemo(context, ctx),
    getDemoData: (ctx: SecurityContext) => getDemoData(context, ctx),
  };
}
