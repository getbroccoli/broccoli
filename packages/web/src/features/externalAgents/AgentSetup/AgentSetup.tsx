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
 * Your agent on Setup AI: how it gets the files, and the prompt with its one-time code. The prompt
 * shows by itself, with a new code for another way or after its expiry; a reload makes a new one.
 * With an agent connected it waits for "Show the prompt", since a new code ends that agent's session.
 */
export function AgentSetup({ chosen, connectedClient }: Props) {
  const [way, setWay] = useState<AgentWay>("ANSWERS_MASKED_QUESTIONS");
  // Off while a connected agent keeps its session, and after a failure until the owner retries.
  const [asked, setAsked] = useState(connectedClient === null);
  // Counts the codes that expired, so the latest one asks for a new code.
  const [round, setRound] = useState(0);
  const [code, setCode] = useState<{
    way: AgentWay;
    round: number;
    value: string;
    expiresAt: string;
  } | null>(null);
  const [chooseAgent, choosing] = usePayloadMutation(ChooseAgentDocument);
  const [createAgentCode, creating] = usePayloadMutation(CreateAgentCodeDocument);
  const busy = choosing.loading || creating.loading;
  const shown = code?.way === way && code.round === round ? code : null;

  useEffect(() => {
    if (!asked) {
      return;
    }
    let current = true;
    // The code needs the agent chosen; choosing it changes `chosen`, which runs this again.
    const making = chosen
      ? createAgentCode({ variables: { way } }).then(({ agentCode }) => {
          if (current && agentCode) {
            setCode({ way, round, value: agentCode.code, expiresAt: agentCode.expiresAt });
          }
        })
      : chooseAgent();
    making.catch(() => {
      if (current) {
        setAsked(false); // The hooks keep the error for display.
      }
    });
    return () => {
      current = false;
    };
  }, [asked, chosen, way, round, chooseAgent, createAgentCode]);
  useEffect(() => {
    if (!shown) {
      return;
    }
    const expiry = setTimeout(
      () => setRound((expired) => expired + 1),
      Date.parse(shown.expiresAt) - Date.now(),
    );
    return () => clearTimeout(expiry);
  }, [shown]);

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="grid gap-2.5 sm:grid-cols-2" disabled={busy}>
        <legend className="mb-2 text-sm font-medium">{t("externalAgents.ways")}</legend>
        <WayOption
          value="ANSWERS_MASKED_QUESTIONS"
          selected={way}
          onSelect={setWay}
          title={t("externalAgents.masked")}
          badge={t("externalAgents.recommended")}
          hint={t("externalAgents.maskedHint")}
        />
        <WayOption
          value="PARSES_ORIGINAL_FILES"
          selected={way}
          onSelect={setWay}
          title={t("externalAgents.parsed")}
          hint={t("externalAgents.parsedHint")}
        />
      </fieldset>
      {asked ? (
        <>
          <AgentSentence code={shown?.value ?? null} />
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
          <Button type="button" variant="outline" onClick={() => setAsked(true)}>
            {t("externalAgents.showPrompt")}
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
