import { expect, it } from "vitest";

import { consentKind } from "./consentKind";

it("recognises a first connection when the person has no agent", () => {
  expect(consentKind({ clientId: "agent", scopes: read, current: null })).toBe("FIRST_CONNECTION");
});

it("replaces an existing connection from a different client", () => {
  expect(consentKind({ clientId: "other", scopes: readWrite, current: readOnlyAgent })).toBe(
    "REPLACING_ANOTHER_AGENT",
  );
});

it("widens a read-only connection when the same agent asks for write", () => {
  expect(consentKind({ clientId: "agent", scopes: readWrite, current: readOnlyAgent })).toBe(
    "SAME_AGENT_WIDENING",
  );
});

it("recognises the same agent asking for read access again", () => {
  expect(consentKind({ clientId: "agent", scopes: read, current: readOnlyAgent })).toBe(
    "SAME_AGENT_AGAIN",
  );
});

const read = new Set(["broccoli:read"]);
const readWrite = new Set(["broccoli:read", "broccoli:write"]);
const readOnlyAgent = { clientId: "agent", canChangeThings: false };
