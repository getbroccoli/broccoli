import { ShieldCheck } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { SaveAiSourceDocument, type AiSource, type AiStepQuery } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { useStartDemo } from "@/features/imports";
import { SetupStepForm } from "@/features/setup";
import { t } from "@/i18n";

import { AgentOption } from "./AgentOption";
import { AiFooter } from "./AiFooter";
import { DemoDataCard } from "./DemoDataCard";
import { failureOf } from "./failureOf";
import { KeyField } from "./KeyField";
import { KnownKey } from "./KnownKey";
import { SourceOption } from "./SourceOption";

type Props = {
  ai: NonNullable<AiStepQuery["setup"]["ai"]>;
  /** Demo data is only for an import without people. */
  peopleGathered: boolean;
};

/** Next checks the chosen source and saves it, then the owner gathers their files. */
export function AiForm({ ai, peopleGathered }: Props) {
  const navigate = useNavigate();
  const [source, setSource] = useState<AiSource>(ai.source);
  // The key being typed; null while the known key is used, and Replace starts one.
  const [newKey, setNewKey] = useState<string | null>(null);
  const [saveAiSource, { loading: checking, error, payloadError }] =
    usePayloadMutation(SaveAiSourceDocument);
  const demo = useStartDemo();
  const busy = checking || demo.starting;
  const knownKey = newKey === null ? ai.openRouterKey : null;
  const key = newKey ?? "";
  const asksForKey = source === "OPENROUTER" && knownKey === null;
  const failure = payloadError || error ? failureOf(payloadError, source) : null;
  // A refused key shows under the key field; a known key has no field, so it shows below.
  const keyFieldError = failure?.onKey && asksForKey ? t(failure.message) : undefined;

  const save = async () => {
    try {
      await saveAiSource({
        variables: { input: { source, openRouterKey: asksForKey ? key : null } },
      });
    } catch {
      return; // The hook keeps the error for display.
    }
    await navigate({ to: "/setup/import" });
  };

  return (
    <SetupStepForm
      onSubmit={() => void save()}
      footer={
        <AiFooter
          checking={checking ? source : null}
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
          <AgentOption />
        </fieldset>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("setup.ai.privacy")}</p>
      </div>
      <DemoDataCard
        disabled={busy}
        unavailable={peopleGathered}
        starting={demo.starting}
        onUse={() => void demo.start()}
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
