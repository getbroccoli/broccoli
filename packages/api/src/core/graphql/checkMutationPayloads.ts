import {
  getNamedType,
  type GraphQLField,
  type GraphQLObjectType,
  type GraphQLSchema,
  isNonNullType,
  isObjectType,
  isUnionType,
} from "graphql";

/**
 * Refuses a schema whose mutations break the payload rules (RULE24, RULE27 in
 * docs/code-quality.md): every operation in a mutation namespace returns a non-null
 * `…Payload` object, and a payload's `error`, if it has one, is a nullable union of `Error`
 * types.
 */
export function checkMutationPayloads(schema: GraphQLSchema): void {
  const mutation = schema.getMutationType();
  if (!mutation) {
    return;
  }
  for (const namespaceField of Object.values(mutation.getFields())) {
    const namespace = getNamedType(namespaceField.type);
    if (!isObjectType(namespace)) {
      continue;
    }
    for (const operation of Object.values(namespace.getFields())) {
      checkPayload(namespace, operation);
    }
  }
}

function checkPayload(namespace: GraphQLObjectType, operation: GraphQLField<unknown, unknown>) {
  const payload = isNonNullType(operation.type) ? operation.type.ofType : undefined;
  if (!isObjectType(payload) || !payload.name.endsWith("Payload")) {
    throw new Error(
      `${namespace.name}.${operation.name} must return a non-null object type named …Payload.`,
    );
  }
  const error = payload.getFields().error;
  if (error && !isErrorUnion(error)) {
    throw new Error(`${payload.name}.error must be a nullable union of Error types.`);
  }
}

function isErrorUnion({ type }: GraphQLField<unknown, unknown>): boolean {
  return (
    isUnionType(type) &&
    type.getTypes().every((member) => member.getInterfaces().some(({ name }) => name === "Error"))
  );
}
