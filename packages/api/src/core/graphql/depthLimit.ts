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
  return (context) => {
    const measure = new DepthMeasure(context);
    return {
      OperationDefinition(operation) {
        if (measure.depthOf(operation.selectionSet) > maxDepth) {
          context.reportError(
            new GraphQLError(`Operation exceeds the maximum depth of ${maxDepth}.`, {
              nodes: operation,
            }),
          );
        }
      },
    };
  };
}

/** Measures each fragment once, so repeated spreads cannot make validation exponential. */
class DepthMeasure {
  private readonly fragmentDepths = new Map<string, number>();

  constructor(private readonly context: ValidationContext) {}

  depthOf(selectionSet: SelectionSetNode): number {
    return Math.max(
      0,
      ...selectionSet.selections.map((selection) => this.depthOfSelection(selection)),
    );
  }

  private depthOfSelection(selection: SelectionNode): number {
    switch (selection.kind) {
      case Kind.FIELD:
        if (selection.name.value.startsWith("__")) {
          return 0;
        }
        return 1 + (selection.selectionSet ? this.depthOf(selection.selectionSet) : 0);
      case Kind.INLINE_FRAGMENT:
        return this.depthOf(selection.selectionSet);
      case Kind.FRAGMENT_SPREAD:
        return this.fragmentDepth(selection.name.value);
    }
  }

  private fragmentDepth(name: string): number {
    const known = this.fragmentDepths.get(name);
    if (known !== undefined) {
      return known;
    }
    // graphql-js reports unknown and cyclic fragments itself; they count as 0 here.
    this.fragmentDepths.set(name, 0);
    const fragment = this.context.getFragment(name);
    const depth = fragment ? this.depthOf(fragment.selectionSet) : 0;
    this.fragmentDepths.set(name, depth);
    return depth;
  }
}
