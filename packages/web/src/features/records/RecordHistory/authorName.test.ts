import { expect, it } from "vitest";

import { authorName } from "./historyLines";

it("names the reader's own change You", () => {
  expect(
    authorName({ kind: "SIGNED_IN_USER", userId: "reader", email: "avery@example.com" }, "reader"),
  ).toBe("You");
});

it("names another signed-in author by their email", () => {
  expect(
    authorName({ kind: "SIGNED_IN_USER", userId: "avery", email: "avery@example.com" }, "reader"),
  ).toBe("avery@example.com");
});

it("names a deleted user Someone", () => {
  expect(authorName({ kind: "SIGNED_IN_USER", userId: "gone", email: null }, "reader")).toBe(
    "Someone",
  );
});

it("names the reader's own change through their connected agent", () => {
  expect(
    authorName({ kind: "CONNECTED_AGENT", userId: "reader", email: "avery@example.com" }, "reader"),
  ).toBe("You, through your agent");
});

it("names another person's change through their connected agent by their email", () => {
  expect(
    authorName({ kind: "CONNECTED_AGENT", userId: "avery", email: "avery@example.com" }, "reader"),
  ).toBe("avery@example.com through their agent");
});

it("names Broccoli's own changes Broccoli", () => {
  expect(authorName({ kind: "BROCCOLI_ITSELF", userId: null, email: null }, "reader")).toBe(
    "Broccoli",
  );
});

it("names the setup holder Setup", () => {
  expect(authorName({ kind: "SETUP_HOLDER", userId: null, email: null }, "reader")).toBe("Setup");
});

it("names an external agent Your agent", () => {
  expect(authorName({ kind: "EXTERNAL_AGENT", userId: null, email: null }, "reader")).toBe(
    "Your agent",
  );
});
