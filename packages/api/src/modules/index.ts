import type { ModuleManifest } from "../core/module-manifest";
import { system } from "./system";

/** Every module of the API; the core builds the API from this list. */
export const modules: readonly ModuleManifest[] = [system];
