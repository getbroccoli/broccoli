import type { ModuleDependencies } from "../../../../core/moduleManifest";

/** What the demo use cases work with. */
export type DemoContext = Pick<ModuleDependencies, "orm" | "transact">;
