import { useEffect, useState } from "react";

import { CreateExternalAgentCodeDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { ExternalAgentSentence } from "./ExternalAgentSentence";

/**
 * Connecting the owner's agent on the import step: the prompt with a one-time code, made as the
 * page opens and again once it expires, and the wait for the agent. Shown only while no agent is
 * connected, since a new code ends that agent's session.
 */
export function ExternalAgentPrompt() {
  // Counts the codes made, so an expired one asks for the next.
  const [round, setRound] = useState(0);
  const [code, setCode] = useState<{ round: number; value: string; expiresAt: string } | null>(
    null,
  );
  const [createExternalAgentCode, creating] = usePayloadMutation(CreateExternalAgentCodeDocument);
  const shown = code?.round === round ? code : null;
  const failed = Boolean(creating.error || creating.payloadError);

  useEffect(() => {
    let current = true;
    // A new code cancels every earlier one, so requests wait for each other: the last one asked
    // for, the one shown, also commits last. React's strict mode asks twice on mount.
    const request = codeRequests.then(() => createExternalAgentCode());
    codeRequests = request.catch(() => {});
    request
      .then(({ externalAgentCode }) => {
        if (current && externalAgentCode) {
          setCode({ round, value: externalAgentCode.code, expiresAt: externalAgentCode.expiresAt });
        }
      })
      .catch(() => {}); // The hook keeps the error for display.
    return () => {
      current = false;
    };
  }, [round, createExternalAgentCode]);
  useEffect(() => {
    if (!shown) {
      return;
    }
    const expiry = setTimeout(
      () => setRound((made) => made + 1),
      Date.parse(shown.expiresAt) - Date.now(),
    );
    return () => clearTimeout(expiry);
  }, [shown]);

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-border p-[18px]">
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-medium">{t("externalAgents.connectTitle")}</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t("externalAgents.connectHint")}
        </p>
      </div>
      <ExternalAgentSentence code={failed ? null : (shown?.value ?? null)} />
      {failed ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          {/* The one refusal a page at this step meets: an address the code must not travel to. */}
          {t(creating.payloadError ? "externalAgents.unsafeOrigin" : "externalAgents.failed")}
          <Button type="button" variant="outline" size="sm" onClick={() => setRound((n) => n + 1)}>
            {t("externalAgents.retry")}
          </Button>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-3 shrink-0 animate-spin rounded-full border-2 border-border border-t-foreground"
          />
          {t("externalAgents.waiting")}
        </p>
      )}
    </div>
  );
}

/** The code requests of every mounted prompt, in the order they were asked for. */
let codeRequests: Promise<unknown> = Promise.resolve();
