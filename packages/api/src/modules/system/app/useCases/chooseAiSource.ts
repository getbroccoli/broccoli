import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import {
  currentAi,
  readAiSource,
  saveAiSource,
  type AiSource,
  type CurrentAi,
} from "../../../../core/instance";
import type { SecurityContext } from "../../../../core/security";
import { DecisionsError } from "../../../../integrations/ai";
import type { SystemContext } from "./systemContext";

export interface AiSourceInput {
  source: AiSource;
  /** Replaces the saved key; blank counts as none. */
  openRouterKey?: string | null;
}

/** Checks that the chosen source works, then saves it, so files are read with it from now on. */
export async function chooseAiSource(
  context: SystemContext,
  ctx: SecurityContext,
  { source, openRouterKey }: AiSourceInput,
): Promise<CurrentAi> {
  ctx.requireSetupAccess();
  if (context.mode === "managed") {
    throw new ApplicationError("CONFLICT", "A managed instance reads files with its own key.");
  }
  const givenKey = openRouterKey?.trim() || undefined;
  if (source === "openrouter") {
    await checkOpenRouter(context, givenKey);
  } else {
    await checkBroccoliAi(context);
  }
  await context.transact((tx) =>
    saveAiSource(tx, context.secretBox, { source, openRouterKey: givenKey }),
  );
  return currentAi(await readAiSource(context.orm, context.secretBox), context.ai.environmentKey);
}

/** Checks the given key, else the one files would be read with now. */
async function checkOpenRouter(
  { orm, secretBox, ai }: SystemContext,
  givenKey: string | undefined,
): Promise<void> {
  const key = givenKey ?? (await readAiSource(orm, secretBox)).openRouterKey ?? ai.environmentKey;
  if (key === null) {
    throw invalidInput([{ field: "openRouterKey", code: "required" }]);
  }
  try {
    await ai.checkOpenRouterKey(key);
  } catch (error) {
    throw refusalOf(error, () => invalidInput([{ field: "openRouterKey", code: "rejected" }]));
  }
}

async function checkBroccoliAi({ ai }: SystemContext): Promise<void> {
  try {
    await ai.prepareBroccoliAi();
  } catch (error) {
    throw refusalOf(error, (refusal) =>
      refusal.reason === "free_period_used"
        ? invalidInput([{ field: "source", code: "free_period_used" }])
        : unavailable(),
    );
  }
}

/** The payload error for a source's refusal; a retryable one says "try later". */
function refusalOf(error: unknown, final: (refusal: DecisionsError) => ApplicationError): unknown {
  if (!(error instanceof DecisionsError)) {
    return error;
  }
  return error.retryable ? unavailable() : final(error);
}

function unavailable(): ApplicationError {
  return new ApplicationError("UNAVAILABLE", "The AI service could not be reached. Try again.");
}
