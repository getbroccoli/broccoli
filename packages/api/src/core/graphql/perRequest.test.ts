import { expect, it } from "vitest";

import { OWNER } from "#test/support";

import { GraphqlContext } from "./apollo";
import { perRequest } from "./perRequest";

it("creates the value once per request, from that request's context", () => {
  const contexts: GraphqlContext[] = [];
  const loaders = perRequest((context) => {
    contexts.push(context);
    return {};
  });
  const request = new GraphqlContext(OWNER, NO_ORIGIN);

  expect(contexts).toEqual([]);
  expect(loaders(request)).toBe(loaders(request));
  expect(contexts).toEqual([request]);
});

it("gives each request its own value, even for the same user", () => {
  const loaders = perRequest(() => ({}));

  expect(loaders(new GraphqlContext(OWNER, NO_ORIGIN))).not.toBe(
    loaders(new GraphqlContext(OWNER, NO_ORIGIN)),
  );
});

it("keeps the values of two accessors apart", () => {
  const request = new GraphqlContext(OWNER, NO_ORIGIN);

  expect(perRequest(() => ({}))(request)).not.toBe(perRequest(() => ({}))(request));
});

const NO_ORIGIN = () => Promise.resolve("http://localhost");
