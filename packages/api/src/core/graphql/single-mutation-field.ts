import {
  GraphQLError,
  Kind,
  OperationTypeNode,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from "graphql";

/**
 * Rejects a mutation with more than one root field. Mutations are namespaced
 * (`absence { request }`), so the real operations sit below the root, where GraphQL
 * runs them in parallel; one root field per request keeps them serial.
 */
export const singleMutationField: ValidationRule = (context) => ({
  OperationDefinition(operation) {
    if (operation.operation !== OperationTypeNode.MUTATION) {
      return;
    }
    if (countFields(operation.selectionSet, context, new Set()) > 1) {
      context.reportError(
        new GraphQLError("A request may contain only one mutation field.", { nodes: operation }),
      );
    }
  },
});

function countFields(
  selectionSet: SelectionSetNode,
  context: ValidationContext,
  visitedFragments: ReadonlySet<string>,
): number {
  let count = 0;
  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      count += 1;
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      count += countFields(selection.selectionSet, context, visitedFragments);
    } else {
      const name = selection.name.value;
      const fragment = context.getFragment(name);
      // graphql-js reports unknown and cyclic fragments itself; skip them here.
      if (fragment && !visitedFragments.has(name)) {
        count += countFields(fragment.selectionSet, context, new Set(visitedFragments).add(name));
      }
    }
  }
  return count;
}
