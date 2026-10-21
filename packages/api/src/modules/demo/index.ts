import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { createDemoUseCases } from "./app";
import { createResolvers } from "./graphql";

export { createDemoUseCases, prepareDemoFill } from "./app";

/** The sample company an owner can start with instead of importing their people; and clearing it. */
export function demoModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact">,
): ModuleManifest {
  const useCases = createDemoUseCases(dependencies);
  return {
    name: "demo",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(useCases),
  };
}
