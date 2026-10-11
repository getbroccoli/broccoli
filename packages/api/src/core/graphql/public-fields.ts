import { defaultFieldResolver, type GraphQLField, type GraphQLSchema } from "graphql";

import { requireSignedIn } from "../actor";
import type { GraphqlContext } from "./apollo";

/**
 * Denies by default: every root Query and Mutation field without `@public` refuses a
 * request without a session before its resolver runs. Nested fields are reachable
 * only through a root field, so checking the roots covers the whole schema.
 */
export function requireSessionOutsidePublicFields(schema: GraphQLSchema): GraphQLSchema {
  for (const rootType of [schema.getQueryType(), schema.getMutationType()]) {
    // graphql-js types every field map as `GraphQLField<any, any>`.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const fields: GraphQLField<unknown, GraphqlContext>[] = Object.values(
      rootType?.getFields() ?? {},
    );
    for (const field of fields) {
      if (!isPublic(field)) {
        requireSession(field);
      }
    }
  }
  return schema;
}

function isPublic(field: GraphQLField<unknown, GraphqlContext>): boolean {
  return field.astNode?.directives?.some((directive) => directive.name.value === "public") ?? false;
}

function requireSession(field: GraphQLField<unknown, GraphqlContext>): void {
  const resolve = field.resolve ?? defaultFieldResolver;
  field.resolve = (source, args, context, info) => {
    requireSignedIn(context.optionalActor);
    return resolve(source, args, context, info);
  };
}
