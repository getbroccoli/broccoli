import { readSdl } from "../../core/graphql";
import type { ModuleManifest } from "../../core/moduleManifest";
import { createDemoService } from "./app";
import { createResolvers } from "./graphql";

// Public values.
export { createDemoFillService, createDemoService } from "./app";

/** The sample company an owner can start with instead of importing their people; and exiting it. */
export function demoModule(dependencies: Parameters<typeof createDemoService>[0]): ModuleManifest {
  return {
    name: "demo",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(createDemoService(dependencies)),
  };
}
