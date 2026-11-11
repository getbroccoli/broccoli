import { expect, it, onTestFinished, vi } from "vitest";

import { loginSearch, toLocalPath } from "./loginSearch";

const origin = "http://localhost:5173";

it.each(["sign_in_required", "sign_in_unavailable"])("keeps the %s error", (error) => {
  expect(loginSearch.parse({ error }).error).toBe(error);
});

it("drops an unknown error", () => {
  expect(loginSearch.parse({ error: "<script>" }).error).toBeUndefined();
});

it("resumes OAuth authorization in parameter order without the signature, login prompt or an earlier redirect", () => {
  const search = {
    response_type: "code",
    exp: "1800000000",
    client_id: "agent-client",
    redirect_uri: "http://127.0.0.1:33418/callback",
    scope: "broccoli:read offline_access",
    ba_iat: "1799999700",
    state: "client-state",
    code_challenge: "challenge",
    ba_param: ["client_id", "scope"],
    code_challenge_method: "S256",
    resource: "https://broccoli.example.com/api/mcp",
    sig: "signed-query",
    prompt: "login",
    redirect: "/api/auth/oauth2/authorize?client_id=agent-client",
  };

  vi.stubGlobal("window", { location: { origin } });
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });

  const parsed = loginSearch.parse(search);

  expect(parsed.redirect).toBe(
    "/api/auth/oauth2/authorize?response_type=code&client_id=agent-client" +
      "&redirect_uri=http%3A%2F%2F127.0.0.1%3A33418%2Fcallback" +
      "&scope=broccoli%3Aread+offline_access&state=client-state&code_challenge=challenge" +
      "&code_challenge_method=S256&resource=https%3A%2F%2Fbroccoli.example.com%2Fapi%2Fmcp",
  );
});

it("keeps a local path with its query and hash", () => {
  expect(toLocalPath("/people?q=ann#x", origin)).toBe("/people?q=ann#x");
});

it("defaults an empty redirect to Tasks", () => {
  expect(toLocalPath("", origin)).toBe("/tasks");
});

it.each([
  ["an external URL", "https://example.com/x"],
  ["a protocol-relative URL", "//example.com"],
  ["a malformed protocol-relative URL", "//"],
  ["a dot segment that exposes a protocol-relative URL", "/a/..//example.com"],
  ["a backslash", "/\\example.com"],
  ["a JavaScript URL", "javascript:alert(1)"],
  ["a control character", "/peo\nple"],
])("defaults a redirect containing %s to Tasks", (_kind, raw) => {
  expect(toLocalPath(raw, origin)).toBe("/tasks");
});

it("defaults a login redirect to Tasks to avoid a loop", () => {
  expect(toLocalPath("/login?redirect=/people", origin)).toBe("/tasks");
});
