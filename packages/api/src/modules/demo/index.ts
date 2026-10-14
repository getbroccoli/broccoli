import { readSdl } from "../../core/graphql";
import type { ModuleDependencies, ModuleManifest } from "../../core/moduleManifest";
import { PrincipalSecurityContext } from "../../core/security";
import { todayInUtc } from "../../utils";
import { createDemoUseCases } from "./app";
import { createResolvers } from "./graphql";

export { createDemoUseCases, type DemoUseCases } from "./app";

/** The sample company a new instance starts with, until import exists; and clearing it. */
export function demoModule(
  dependencies: Pick<ModuleDependencies, "orm" | "transact">,
): ModuleManifest {
  const useCases = createDemoUseCases(dependencies);
  return {
    name: "demo",
    typeDefs: readSdl(import.meta.url, "./graphql/schema.graphql"),
    resolvers: createResolvers(useCases),
    events: {
      "instance.setup_completed": () =>
        useCases.seedDemoData(PrincipalSecurityContext.system(), todayInUtc()),
    },
  };
}
