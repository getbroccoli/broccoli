import { useEffect, useState } from "react";

import {
  type AgentWay,
  ChooseAgentDocument,
  CreateAgentCodeDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { AgentSentence } from "./AgentSentence";
import { WayOption } from "./WayOption";

type Props = {
  /** Whether the agent is already the saved AI source; else showing a prompt chooses it first. */
  chosen: boolean;
  /** The agent connected now, if any: a new prompt ends its session. */
  connectedClient: string | null;
};

/**
 * Your agent on Setup AI: how it gets the files, and the prompt with its one-time code. The code is
 * shown once; a reload, another way or its expiry needs a new prompt.
 */
export function AgentSetup({ chosen, connectedClient }: Props) {
  const [way, setWay] = useState<AgentWay>("ANSWERS_MASKED_QUESTIONS");
  const [code, setCode] = useState<{ value: string; expiresAt: string } | null>(null);
  const [chooseAgent, choosing] = usePayloadMutation(ChooseAgentDocument);
  const [createAgentCode, creating] = usePayloadMutation(CreateAgentCodeDocument);
  const busy = choosing.loading || creating.loading;
  useEffect(() => {
    if (!code) {
      return;
    }
    const expiry = setTimeout(() => setCode(null), Date.parse(code.expiresAt) - Date.now());
    return () => clearTimeout(expiry);
  }, [code]);

  const choose = (next: AgentWay) => {
    setCode(null);
    setWay(next);
  };
  const showPrompt = async () => {
    try {
      if (!chosen) {
        await chooseAgent();
      }
      const { agentCode } = await createAgentCode({ variables: { way } });
      setCode(agentCode && { value: agentCode.code, expiresAt: agentCode.expiresAt });
    } catch {
      setCode(null); // The hooks keep the error for display.
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="grid gap-2.5 sm:grid-cols-2" disabled={busy}>
        <legend className="mb-2 text-sm font-medium">{t("externalAgents.ways")}</legend>
        <WayOption
          value="ANSWERS_MASKED_QUESTIONS"
          selected={way}
          onSelect={choose}
          title={t("externalAgents.masked")}
          badge={t("externalAgents.recommended")}
          hint={t("externalAgents.maskedHint")}
        />
        <WayOption
          value="PARSES_ORIGINAL_FILES"
          selected={way}
          onSelect={choose}
          title={t("externalAgents.parsed")}
          hint={t("externalAgents.parsedHint")}
        />
      </fieldset>
      {code ? (
        <>
          <AgentSentence code={code.value} />
          <p role="status" className="text-[13px] text-muted-foreground">
            {t(
              way === "ANSWERS_MASKED_QUESTIONS"
                ? "externalAgents.maskedFolder"
                : "externalAgents.parsedFolder",
            )}{" "}
            {t("externalAgents.codeOnce")}
          </p>
        </>
      ) : (
        <div className="flex flex-col items-start gap-1.5">
          <Button type="button" variant="outline" disabled={busy} onClick={() => void showPrompt()}>
            {t(busy ? "externalAgents.creating" : "externalAgents.showPrompt")}
          </Button>
          {connectedClient && (
            <p className="text-[13px] text-muted-foreground">
              {t("externalAgents.replacesConnected", { client: connectedClient })}
            </p>
          )}
        </div>
      )}
      {/* The one refusal a page at this step meets: an address the code must not travel to. */}
      {creating.payloadError && (
        <p role="alert" className="text-sm text-destructive">
          {t("externalAgents.unsafeOrigin")}
        </p>
      )}
      {(choosing.error || choosing.payloadError || creating.error) && (
        <p role="alert" className="text-sm text-destructive">
          {t("externalAgents.failed")}
        </p>
      )}
    </div>
  );
}
