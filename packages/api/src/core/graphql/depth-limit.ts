import {
  GraphQLError,
  Kind,
  type SelectionNode,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from "graphql";

/**
 * Rejects operations whose fields nest deeper than `maxDepth`; a top-level field is
 * depth 1. `__typename` and introspection fields do not count.
 */
export function depthLimit(maxDepth: number): ValidationRule {
  return (context) => ({
    OperationDefinition(operation) {
      if (depthOf(operation.selectionSet, context, new Set()) > maxDepth) {
        context.reportError(
          new GraphQLError(`Operation exceeds the maximum depth of ${maxDepth}.`, {
            nodes: operation,
          }),
        );
      }
    },
  });
}

function depthOf(
  selectionSet: SelectionSetNode,
  context: ValidationContext,
  visitedFragments: ReadonlySet<string>,
): number {
  return Math.max(
    0,
    ...selectionSet.selections.map((selection) =>
      depthOfSelection(selection, context, visitedFragments),
    ),
  );
}

function depthOfSelection(
  selection: SelectionNode,
  context: ValidationContext,
  visitedFragments: ReadonlySet<string>,
): number {
  switch (selection.kind) {
    case Kind.FIELD:
      if (selection.name.value.startsWith("__")) {
        return 0;
      }
      return (
        1 +
        (selection.selectionSet ? depthOf(selection.selectionSet, context, visitedFragments) : 0)
      );
    case Kind.INLINE_FRAGMENT:
      return depthOf(selection.selectionSet, context, visitedFragments);
    case Kind.FRAGMENT_SPREAD: {
      const name = selection.name.value;
      const fragment = context.getFragment(name);
      // graphql-js reports unknown and cyclic fragments itself; skip them here.
      if (!fragment || visitedFragments.has(name)) {
        return 0;
      }
      return depthOf(fragment.selectionSet, context, new Set(visitedFragments).add(name));
    }
  }
}
