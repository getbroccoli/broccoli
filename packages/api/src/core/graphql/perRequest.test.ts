import { expect, it } from "vitest";

import { createGraphqlContext, OWNER } from "#test/support";

import type { GraphqlContext } from "./apollo";
import { perRequest } from "./perRequest";

it("creates the value once per request, from that request's context", () => {
  const contexts: GraphqlContext[] = [];
  const loaders = perRequest((context) => {
    contexts.push(context);
    return {};
  });
  const request = createGraphqlContext(OWNER);

  expect(contexts).toEqual([]);
  expect(loaders(request)).toBe(loaders(request));
  expect(contexts).toEqual([request]);
});

it("gives each request its own value, even for the same user", () => {
  const loaders = perRequest(() => ({}));

  expect(loaders(createGraphqlContext(OWNER))).not.toBe(loaders(createGraphqlContext(OWNER)));
});

it("keeps the values of two accessors apart", () => {
  const request = createGraphqlContext(OWNER);

  expect(perRequest(() => ({}))(request)).not.toBe(perRequest(() => ({}))(request));
});
