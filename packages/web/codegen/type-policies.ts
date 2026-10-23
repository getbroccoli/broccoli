import type { PluginFunction } from "@graphql-codegen/plugin-helpers";
import { getNamedType, isObjectType, type GraphQLObjectType, type GraphQLSchema } from "graphql";

/**
 * `{ merge: true }` for every object type without an `id` field that a root Query or
 * Mutation field returns. Such namespace types (`absence { … }`) cannot be normalised,
 * so without it two queries selecting different fields of one namespace overwrite
 * each other in the cache.
 */
export function namespaceTypePolicies(schema: GraphQLSchema): Record<string, { merge: true }> {
  const rootTypes = [schema.getQueryType(), schema.getMutationType()].filter(
    (type) => type != null,
  );
  const namespaces = rootTypes
    .flatMap((root) => Object.values(root.getFields()))
    .map((field) => getNamedType(field.type))
    .filter((type): type is GraphQLObjectType => isObjectType(type) && !("id" in type.getFields()));
  const names = [...new Set(namespaces.map((type) => type.name))].sort();
  return Object.fromEntries(names.map((name) => [name, { merge: true as const }]));
}

export const plugin: PluginFunction = (schema) =>
  [
    'import type { TypePolicies } from "@apollo/client";',
    "",
    `export const typePolicies = ${JSON.stringify(namespaceTypePolicies(schema), null, 2)} satisfies TypePolicies;`,
    "",
  ].join("\n");
