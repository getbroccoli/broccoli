/** A missing generated export means the page and its GraphQL documents are out of sync. */
export function isGraphqlCodegenError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "SyntaxError" &&
    error.message.includes("/__generated__/graphql.ts") &&
    error.message.includes("does not provide an export named")
  );
}
