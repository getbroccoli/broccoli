import type { ModuleDependencies } from "../../../../core/moduleManifest";

/** What the employee use cases need from the core. */
export type EmployeeContext = Pick<ModuleDependencies, "orm" | "transact" | "logger">;
