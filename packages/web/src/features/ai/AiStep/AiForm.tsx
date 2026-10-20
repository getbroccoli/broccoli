import { ShieldCheck } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import {
  ChooseAgentDocument,
  SaveAiSourceDocument,
  type AiSource,
  type AiStepQuery,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { useStartDemo } from "@/features/demo";
import { AgentSetup } from "@/features/externalAgents";
import { SetupStepForm, useSetupPages } from "@/features/setup";
import { t } from "@/i18n";
import { useRouteAction } from "@/lib/useRouteAction";

import { AiFooter } from "./AiFooter";
import { DemoDataCard } from "./DemoDataCard";
import { failureOf } from "./failureOf";
import { KeyField } from "./KeyField";
import { KnownKey } from "./KnownKey";
import { SourceOption } from "./SourceOption";

type Props = {
  ai: NonNullable<AiStepQuery["setup"]["ai"]>;
  /** Demo data is only for an import without people. */
  demoAvailable: boolean;
};

/**
 * Next checks the chosen source and saves it, then the owner gathers their files; with Your agent,
 * Gather is where the agent connects.
 */
export function AiForm({ ai, demoAvailable }: Props) {
  const navigate = useNavigate();
  const { next } = useSetupPages("ai");
  const [source, setSource] = useState<AiSource>(ai.source);
  // The key being typed; null while the known key is used, and Replace starts one.
  const [newKey, setNewKey] = useState<string | null>(null);
  const [saveAiSource, saving] = usePayloadMutation(SaveAiSourceDocument);
  const [chooseAgent, choosing] = usePayloadMutation(ChooseAgentDocument);
  const [run, isContinuing] = useRouteAction();
  // Choosing the agent checks nothing, so it fails only in ways `failureOf` words as a retry.
  const failed =
    source === "AGENT"
      ? choosing.error || choosing.payloadError
      : saving.error || saving.payloadError;
  const demo = useStartDemo();
  const busy = isContinuing || demo.starting;
  const knownKey = newKey === null ? ai.openRouterKey : null;
  const key = newKey ?? "";
  const asksForKey = source === "OPENROUTER" && knownKey === null;
  const failure = failed
    ? failureOf(source === "AGENT" ? null : (saving.payloadError ?? null), source)
    : null;
  // A refused key shows under the key field; a known key has no field, so it shows below.
  const keyFieldError = failure?.onKey && asksForKey ? t(failure.message) : undefined;

  // `usePayloadMutation` keeps a failure for display.
  const save = () =>
    run(
      async () => {
        if (source !== "AGENT") {
          await saveAiSource({
            variables: { input: { source, openRouterKey: asksForKey ? key : null } },
          });
        } else if (ai.source !== "AGENT") {
          // Showing a prompt already chose the agent; choosing again would end its session.
          await chooseAgent();
        }
      },
      () => navigate({ to: next }),
    );

  return (
    <SetupStepForm
      onSubmit={save}
      footer={
        <AiFooter
          checking={isContinuing && source !== "AGENT" ? source : null}
          disabled={busy || (asksForKey && key.trim() === "")}
          busy={busy}
        />
      }
    >
      <p className="-mt-4 flex items-center gap-2 text-sm text-brand-deep">
        <ShieldCheck size={16} aria-hidden className="shrink-0" />
        {t("setup.ai.promise")}
      </p>
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-3" disabled={busy}>
          <legend className="sr-only">{t("setup.ai.options")}</legend>
          <SourceOption
            value="BROCCOLI_AI"
            selected={source}
            onSelect={setSource}
            title={t("setup.ai.broccoliAi")}
            hint={t("setup.ai.broccoliAiHint")}
          />
          <SourceOption
            value="OPENROUTER"
            selected={source}
            onSelect={setSource}
            title={t("setup.ai.openRouter")}
            hint={t(
              knownKey === "ENVIRONMENT"
                ? "setup.ai.openRouterEnvironmentHint"
                : "setup.ai.openRouterHint",
            )}
          >
            {knownKey ? (
              <KnownKey origin={knownKey} onReplace={() => setNewKey("")} />
            ) : (
              <KeyField value={key} onChange={setNewKey} error={keyFieldError} />
            )}
          </SourceOption>
          <SourceOption
            value="AGENT"
            selected={source}
            onSelect={setSource}
            title={t("setup.ai.agent")}
            hint={t("setup.ai.agentHint")}
          >
            <AgentSetup chosen={ai.source === "AGENT"} connectedClient={ai.agent?.client ?? null} />
          </SourceOption>
        </fieldset>
        {/* It describes Broccoli's own model; the agent's way is chosen on the next page. */}
        {source !== "AGENT" && (
          <p className="text-sm leading-relaxed text-muted-foreground">{t("setup.ai.privacy")}</p>
        )}
      </div>
      <DemoDataCard
        disabled={busy}
        unavailable={!demoAvailable}
        starting={demo.starting}
        onUse={demo.start}
      />
      {failure && keyFieldError === undefined && (
        <p role="alert" className="text-sm text-destructive">
          {t(failure.message)}
        </p>
      )}
      {demo.failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("setup.import.skipFailed")}
        </p>
      )}
    </SetupStepForm>
  );
}
