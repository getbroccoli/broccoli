import express from "express";
import { expect, test as baseTest } from "vitest";

import { startSimpleHttpServer } from "#test/support";

import { createLogger } from "../../logger";
import { createDecisions, DECISIONS_MODEL, DecisionsError, type Decisions } from ".";

const test = baseTest.extend<{ app: express.Express; decisions: Decisions }>({
  // eslint-disable-next-line no-empty-pattern -- Vitest reads fixture dependencies from this pattern.
  app: async ({}, use: (app: express.Express) => Promise<void>) => {
    await use(express().use(express.json()));
  },
  decisions: async ({ app }, use) => {
    const server = await startSimpleHttpServer(app);
    try {
      await use(
        createDecisions({
          url: server.url,
          apiKey: "test-model-key",
          logger: createLogger("silent"),
          timeoutMs: 100,
        }),
      );
    } finally {
      await server.stop();
    }
  },
});

const QUESTIONS = {
  name: {
    instructions: "Choose the name column.",
    options: { A: "First column", B: "Second column", none: "No name" },
  },
  email: {
    instructions: "Choose the email column.",
    options: { A: "First column", B: "Second column", none: "No email" },
  },
};
const ANSWERS = {
  name: {
    type: "choice",
    choice: "A",
    confidence: 0.95,
    probabilities: { A: 0.95, B: 0.03, none: 0.02 },
  },
  email: {
    type: "choice",
    choice: "B",
    confidence: 0.9,
    probabilities: { A: 0.05, B: 0.9, none: 0.05 },
  },
};

test("sends the key, model, state and question criteria", async ({ app, decisions }) => {
  let received: unknown;
  app.post("/alpha/decisions", (request, response) => {
    received = { authorization: request.headers.authorization, body: request.body as unknown };
    response.json({ answers: ANSWERS });
  });
  const state = { columns: { A: "Name", B: "Email" } };

  await decisions.decide(state, QUESTIONS);

  expect(received).toEqual({
    authorization: "Bearer test-model-key",
    body: {
      model: DECISIONS_MODEL,
      state,
      questions: {
        name: {
          type: "choice",
          instructions: QUESTIONS.name.instructions,
          criteria: QUESTIONS.name.options,
        },
        email: {
          type: "choice",
          instructions: QUESTIONS.email.instructions,
          criteria: QUESTIONS.email.options,
        },
      },
    },
  });
});

test("returns each choice and confidence while allowing extra response fields", async ({
  app,
  decisions,
}) => {
  app.post("/alpha/decisions", (_request, response) =>
    response.json({ answers: ANSWERS, usage: { tokens: 12 } }),
  );

  expect(await decisions.decide({}, QUESTIONS)).toEqual({
    name: { choice: "A", confidence: 0.95 },
    email: { choice: "B", confidence: 0.9 },
  });
});

test("leaves answers below 0.8 empty and keeps the boundary", async ({ app, decisions }) => {
  app.post("/alpha/decisions", (_request, response) =>
    response.json({
      answers: {
        name: { ...ANSWERS.name, confidence: 0.79 },
        email: { ...ANSWERS.email, confidence: 0.8 },
      },
    }),
  );

  expect(await decisions.decide({}, QUESTIONS)).toEqual({
    name: null,
    email: { choice: "B", confidence: 0.8 },
  });
});

test.for([429, 500])("allows retrying HTTP %s", async (status, { app, decisions }) => {
  app.post("/alpha/decisions", (_request, response) => response.sendStatus(status));

  const result = decisions.decide({}, QUESTIONS);

  await expect(result).rejects.toBeInstanceOf(DecisionsError);
  await expect(result).rejects.toMatchObject({ retryable: true });
});

test("allows retrying a timeout", async ({ app, decisions }) => {
  app.post("/alpha/decisions", () => {
    /* Leave the request unanswered until the client times out. */
  });

  const result = decisions.decide({}, QUESTIONS);

  await expect(result).rejects.toBeInstanceOf(DecisionsError);
  await expect(result).rejects.toMatchObject({ retryable: true });
});

test("does not retry an unauthorized request", async ({ app, decisions }) => {
  app.post("/alpha/decisions", (_request, response) => response.sendStatus(401));

  const result = decisions.decide({}, QUESTIONS);

  await expect(result).rejects.toBeInstanceOf(DecisionsError);
  await expect(result).rejects.toMatchObject({ retryable: false });
});

test("allows retrying a timeout while reading a successful response body", async ({
  app,
  decisions,
}) => {
  let sentHeaders = false;
  app.post("/alpha/decisions", (_request, response) => {
    response.status(200).type("json");
    response.flushHeaders();
    response.write('{"answers":');
    sentHeaders = true;
  });

  const result = decisions.decide({}, QUESTIONS);

  await expect(result).rejects.toBeInstanceOf(DecisionsError);
  await expect(result).rejects.toMatchObject({ retryable: true });
  expect(sentHeaders).toBe(true);
});

test("does not retry a successful response containing malformed JSON", async ({
  app,
  decisions,
}) => {
  app.post("/alpha/decisions", (_request, response) => {
    response.status(200).type("json").send("not JSON");
  });

  const result = decisions.decide({}, QUESTIONS);

  await expect(result).rejects.toBeInstanceOf(DecisionsError);
  await expect(result).rejects.toMatchObject({ retryable: false });
});

test("does not retry an answer outside the offered options", async ({ app, decisions }) => {
  app.post("/alpha/decisions", (_request, response) =>
    response.json({ answers: { ...ANSWERS, name: { ...ANSWERS.name, choice: "C" } } }),
  );

  const result = decisions.decide({}, QUESTIONS);

  await expect(result).rejects.toBeInstanceOf(DecisionsError);
  await expect(result).rejects.toMatchObject({ retryable: false });
});

test("does not retry a missing answer", async ({ app, decisions }) => {
  app.post("/alpha/decisions", (_request, response) =>
    response.json({ answers: { name: ANSWERS.name } }),
  );

  const result = decisions.decide({}, QUESTIONS);

  await expect(result).rejects.toBeInstanceOf(DecisionsError);
  await expect(result).rejects.toMatchObject({ retryable: false });
});
