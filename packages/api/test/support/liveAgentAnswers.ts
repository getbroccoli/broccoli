import { readFileSync } from "node:fs";

import type { MappingAnswersInput, MappingQuestions } from "../../src/modules/imports";
import { leakedValues, OPENROUTER_URL, readCost } from "./liveDecisions";

/** A real model playing the owner's external agent for evals: it answers the masked questions. */
export interface LiveAgentAnswers {
  /** The model's answers to the questions, as the skill tells an agent to give them. */
  answer(questions: MappingQuestions): Promise<MappingAnswersInput>;
  /** Forbidden values found as whole words in what the model was sent, ignoring case. */
  leaked(forbidden: readonly string[]): string[];
  /** What the answers so far cost, in US dollars, as OpenRouter reports it. */
  cost(): number;
}

/** The model that plays the agent unless `EVAL_AGENT_MODEL` names another. */
export const DEFAULT_AGENT_MODEL = "deepseek/deepseek-v4.1-flash-1017";

/** Calls OpenRouter's chat completions with the key in `EVAL_OPEN_ROUTER_KEY`; costs money. */
export function startLiveAgentAnswers(): LiveAgentAnswers {
  const apiKey = process.env.EVAL_OPEN_ROUTER_KEY;
  if (!apiKey) {
    throw new Error("Set EVAL_OPEN_ROUTER_KEY to run the evals");
  }
  const model = process.env.EVAL_AGENT_MODEL ?? DEFAULT_AGENT_MODEL;
  const sentBodies: string[] = [];
  let cost = 0;
  return {
    answer: async (questions) => {
      const body = JSON.stringify({
        model,
        messages: [
          { role: "system", content: SKILL },
          {
            role: "user",
            content: `The questions of one waiting file, as GET /api/agent/files/<id>/questions answered them. Reply with only the JSON body for POST /api/agent/files/<id>/answers.\n\n${JSON.stringify(questions)}`,
          },
        ],
        response_format: { type: "json_object" },
        usage: { include: true },
      });
      sentBodies.push(body);
      const response = await fetch(`${OPENROUTER_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body,
      });
      const text = await response.text();
      cost += readCost(text);
      if (!response.ok) {
        throw new Error(`The model answered ${response.status}: ${text}`);
      }
      const reply = (JSON.parse(text) as { choices: { message: { content: string } }[] })
        .choices[0]!.message.content;
      return JSON.parse(reply) as MappingAnswersInput;
    },
    leaked: (forbidden) => leakedValues(sentBodies, forbidden),
    cost: () => cost,
  };
}

/** What a real agent reads first: the skill Broccoli serves. */
const SKILL = readFileSync(
  new URL("../../src/modules/externalAgents/http/broccoliSetupSkill.md", import.meta.url),
  "utf8",
);
