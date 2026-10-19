import type { AiSource, ChooseAiSourceMutation } from "@/__generated__/graphql";
import type { MessageKey } from "@/i18n";

/** What went wrong, worded for the owner; `onKey` when it is about the pasted key. */
export function failureOf(
  error: ChooseAiSourceError | null,
  source: AiSource,
): { message: MessageKey; onKey: boolean } {
  if (error?.__typename === "InvalidInputError") {
    const code = error.fields[0]?.code;
    if (code === "rejected") {
      return { message: "setup.ai.keyRejected", onKey: true };
    }
    if (code === "required") {
      return { message: "setup.ai.keyRequired", onKey: true };
    }
    if (code === "free_period_used") {
      return { message: "setup.ai.freePeriodUsed", onKey: false };
    }
  }
  if (error?.__typename === "UnavailableError") {
    return {
      message:
        source === "OPENROUTER" ? "setup.ai.openRouterUnavailable" : "setup.ai.broccoliAiBusy",
      onKey: false,
    };
  }
  return { message: "setup.ai.failed", onKey: false };
}

type ChooseAiSourceError = NonNullable<ChooseAiSourceMutation["setup"]["chooseAiSource"]["error"]>;
