import { createExternalAgentCode, exchangeExternalAgentCode, expect, test } from "#test/support";

test("shows reported agent progress in the browser and rejects invalid reports", async ({
  env,
}) => {
  const browser = await env.startSetupAtImport();
  const code = await createExternalAgentCode(browser);
  const token = await exchangeExternalAgentCode(env.url, code);
  const uploaded = await browser.post(
    "/api/setup/external-agent-files?name=staff.csv",
    Buffer.from("Name,Email\nAvery Stone,avery@example.com"),
  );
  const { id } = (await uploaded.json()) as { id: string };
  const url = `${env.url}/api/external-agent/unmapped-files/${id}/progress`;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const query =
    "query { import { id sources { id status externalAgentProgress pickedUpByExternalAgent } } }";

  for (const progress of ["file_found", "file_downloading", "file_mapping"]) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ progress }),
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await (await browser.graphql(query)).json()).toEqual({
      data: {
        import: {
          id: "import",
          sources: [
            {
              id,
              status: "MAPPING",
              externalAgentProgress: progress.toUpperCase(),
              pickedUpByExternalAgent: true,
            },
          ],
        },
      },
    });
  }
  const invalid = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ progress: "approved" }),
  });
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({
    error: { code: "INVALID_INPUT", fields: [{ field: "progress", code: "invalid" }] },
  });
  const anonymous = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ progress: "file_found" }),
  });
  expect(anonymous.status).toBe(401);
  expect(await (await browser.graphql(query)).json()).toMatchObject({
    data: { import: { sources: [{ id, externalAgentProgress: "FILE_MAPPING" }] } },
  });
});
