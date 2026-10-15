import { expect, it } from "vitest";

import { importSearch } from "./importSearch";

it.each(["cancelled", "state", "failed"])("keeps the %s Slack error", (slackError) => {
  expect(importSearch.parse({ slackError }).slackError).toBe(slackError);
});

it("drops an unknown Slack error", () => {
  expect(importSearch.parse({ slackError: "<script>" }).slackError).toBeUndefined();
});
