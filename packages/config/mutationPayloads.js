import graphql from "@graphql-eslint/eslint-plugin";
import { getNamedType, isNonNullType, isObjectType, isUnionType } from "graphql";

/**
 * ESLint config for a package's GraphQL SDL: every mutation returns a payload (RULE24 and
 * RULE27 in docs/code-quality.md), checked against the merged schema of `src/**\/*.graphql`.
 */
export function mutationPayloadsConfig() {
  return {
    files: ["src/**/*.graphql"],
    languageOptions: {
      parser: graphql.parser,
      parserOptions: { graphQLConfig: { schema: "src/**/*.graphql" } },
    },
    plugins: { broccoli: { rules: { "mutation-payloads": mutationPayloadsRule } } },
    rules: { "broccoli/mutation-payloads": "error" },
  };
}

/**
 * Where a schema's mutations break the payload rules: every operation in a mutation namespace
 * returns a non-null `…Payload` object, and a payload's `error`, if it has one, is a nullable
 * union of `Error` types.
 * @param {import("graphql").GraphQLSchema} schema
 * @returns {{ type: string; field: string; message: string }[]}
 */
export function mutationPayloadProblems(schema) {
  const namespaces = Object.values(schema.getMutationType()?.getFields() ?? {})
    .map(({ type }) => getNamedType(type))
    .filter(isObjectType);
  return namespaces.flatMap((namespace) =>
    Object.values(namespace.getFields()).flatMap((operation) => {
      const message = problemOf(namespace, operation);
      return message ? [{ type: namespace.name, field: operation.name, message }] : [];
    }),
  );
}

/** Reports each problem on the operation's field in the file that defines it. */
const mutationPayloadsRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Every mutation returns a payload whose `error` is a union of `Error` types.",
    },
    schema: [],
  },
  create(context) {
    const problems = mutationPayloadProblems(context.sourceCode.parserServices.schema);
    const reportProblems = (definition) => {
      for (const field of definition.fields ?? []) {
        for (const { message } of problems.filter(
          (problem) => problem.type === definition.name.value && problem.field === field.name.value,
        )) {
          context.report({ node: field.name, message });
        }
      }
    };
    return { ObjectTypeDefinition: reportProblems, ObjectTypeExtension: reportProblems };
  },
};

function problemOf(namespace, operation) {
  const payload = isNonNullType(operation.type) ? operation.type.ofType : undefined;
  if (!isObjectType(payload) || !payload.name.endsWith("Payload")) {
    return `${namespace.name}.${operation.name} must return a non-null object type named …Payload.`;
  }
  const error = payload.getFields().error;
  if (error && !isErrorUnion(error.type)) {
    return `${payload.name}.error must be a nullable union of Error types.`;
  }
  return undefined;
}

function isErrorUnion(type) {
  return (
    isUnionType(type) &&
    type.getTypes().every((member) => member.getInterfaces().some(({ name }) => name === "Error"))
  );
}
