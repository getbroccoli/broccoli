import type { Browser } from "./browser";

/**
 * Approves the import as review does: reads the version review would show, then approves it,
 * selecting the payload's `import { id }` and `error`.
 */
export async function approveReviewedImport(browser: Browser): Promise<Response> {
  const read = (await (await browser.graphql("query { import { version } }")).json()) as {
    data: { import: { version: string } };
  };
  return browser.graphql(
    `mutation Approve($version: String!) {
  approveImport(version: $version) { import { id } error { __typename ... on Error { message } } }
}`,
    { version: read.data.import.version },
  );
}
