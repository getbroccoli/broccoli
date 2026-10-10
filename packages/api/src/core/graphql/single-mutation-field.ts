import {
  GraphQLError,
  Kind,
  OperationTypeNode,
  type FieldNode,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from "graphql";

const MESSAGE = "A request may contain only one mutation field.";

/**
 * Lets a mutation run exactly one operation. Mutations are namespaced
 * (`absence { request }`): GraphQL runs the root fields one after another but the
 * fields inside a namespace in parallel, so a request may select one namespace and one
 * operation in it. The operation's payload is unrestricted; `__typename` does not count.
 */
export const singleMutationField: ValidationRule = (context) => {
  const collector = new FieldCollector(context);
  return {
    OperationDefinition(operation) {
      if (operation.operation !== OperationTypeNode.MUTATION) {
        return;
      }
      const namespaces = [...collector.collect(operation.selectionSet).values()];
      const operations = collector.collectAll(namespaces.flatMap((nodes) => [...nodes]));
      if (namespaces.length > 1 || operations.size > 1) {
        context.reportError(new GraphQLError(MESSAGE, { nodes: operation }));
      }
    },
  };
};

/**
 * Fields by response key, as GraphQL merges them into one execution. A set, because
 * repeated spreads of one fragment yield the same nodes.
 */
type FieldsByKey = Map<string, Set<FieldNode>>;

/** Collects each fragment once, so repeated spreads cannot make validation exponential. */
class FieldCollector {
  private readonly fragmentFields = new Map<string, FieldsByKey>();

  constructor(private readonly context: ValidationContext) {}

  /** The fields selected below all of `fields`, merged by response key. */
  collectAll(fields: readonly FieldNode[]): FieldsByKey {
    const merged: FieldsByKey = new Map();
    for (const field of fields) {
      if (field.selectionSet) {
        addFields(merged, this.collect(field.selectionSet));
      }
    }
    return merged;
  }

  collect(selectionSet: SelectionSetNode): FieldsByKey {
    const fields: FieldsByKey = new Map();
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        if (!selection.name.value.startsWith("__")) {
          addFields(
            fields,
            new Map([[(selection.alias ?? selection.name).value, new Set([selection])]]),
          );
        }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        addFields(fields, this.collect(selection.selectionSet));
      } else {
        addFields(fields, this.fragment(selection.name.value));
      }
    }
    return fields;
  }

  private fragment(name: string): FieldsByKey {
    const known = this.fragmentFields.get(name);
    if (known) {
      return known;
    }
    // graphql-js reports unknown and cyclic fragments itself; they select nothing here.
    this.fragmentFields.set(name, new Map());
    const fragment = this.context.getFragment(name);
    const fields = fragment
      ? this.collect(fragment.selectionSet)
      : new Map<string, Set<FieldNode>>();
    this.fragmentFields.set(name, fields);
    return fields;
  }
}

function addFields(target: FieldsByKey, source: FieldsByKey): void {
  for (const [key, nodes] of source) {
    target.set(key, new Set([...(target.get(key) ?? []), ...nodes]));
  }
}
