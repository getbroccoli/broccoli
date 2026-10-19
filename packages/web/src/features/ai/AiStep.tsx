import { useQuery } from "@apollo/client/react";
import { Check, ShieldCheck, UsersThree } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";

import {
  AiStepDocument,
  ChooseAiDocument,
  type AiKeyOrigin,
  type AiSource,
  type AiStepQuery,
  type ChooseAiMutation,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSkipWithDemoData } from "@/features/imports";
import { SetupStepForm } from "@/features/setup";
import { type MessageKey, t } from "@/i18n";
import { cn } from "@/lib/class-names";

const CREATE_KEY_URL = "https://openrouter.ai/keys";

/** The Setup AI step: how Broccoli reads the owner's files, or demo data instead. */
export function AiStep() {
  const { data, error, refetch } = useQuery(AiStepDocument);
  const ai = data?.setup.ai;

  if (ai) {
    return <AiForm ai={ai} />;
  }
  return (
    <SetupStepForm onSubmit={() => {}} footer={<NextButton checking={false} disabled />}>
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("setup.ai.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("setup.ai.retry")}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-[280px] rounded-xl" />
      )}
    </SetupStepForm>
  );
}

type Ai = NonNullable<AiStepQuery["setup"]["ai"]>;

/** Next checks the chosen source and saves it, then the owner gathers their files. */
function AiForm({ ai }: { ai: Ai }) {
  const navigate = useNavigate();
  const [source, setSource] = useState<AiSource>(ai.source);
  const [replacingKey, setReplacingKey] = useState(false);
  const [key, setKey] = useState("");
  const [chooseAi, { loading: checking, payloadError }] = usePayloadMutation(ChooseAiDocument);
  const [failed, setFailed] = useState(false);
  const demo = useSkipWithDemoData();
  const busy = checking || demo.skipping;
  // Replace sets the known key aside until another one is saved.
  const knownKey = replacingKey ? null : ai.openRouterKey;
  const asksForKey = source === "OPENROUTER" && knownKey === null;
  const failure = failed ? failureOf(payloadError, source) : null;

  const choose = async () => {
    setFailed(false);
    try {
      await chooseAi({
        variables: { input: { source, openRouterKey: asksForKey ? key : null } },
      });
    } catch {
      setFailed(true);
      return;
    }
    await navigate({ to: "/setup/import" });
  };

  return (
    <SetupStepForm
      onSubmit={() => void choose()}
      footer={
        <NextButton checking={checking} disabled={busy || (asksForKey && key.trim() === "")} />
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
              <KnownKey origin={knownKey} onReplace={() => setReplacingKey(true)} />
            ) : (
              <KeyField
                value={key}
                onChange={setKey}
                error={failure?.onKey ? t(failure.message) : undefined}
              />
            )}
          </SourceOption>
          <AgentOption />
        </fieldset>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("setup.ai.privacy")}</p>
      </div>
      <DemoDataCard disabled={busy} skipping={demo.skipping} onUse={() => void demo.skip()} />
      {failure && !failure.onKey && (
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

interface SourceOptionProps {
  value: AiSource;
  selected: AiSource;
  onSelect: (source: AiSource) => void;
  title: string;
  hint: string;
  /** Shown under the hint while this option is selected. */
  children?: ReactNode;
}

/** One way to read files, as a card holding its radio button. */
function SourceOption({ value, selected, onSelect, title, hint, children }: SourceOptionProps) {
  const isSelected = value === selected;
  const id = `ai-source-${value}`;
  return (
    <div
      className={cn(
        "rounded-xl border bg-card px-4 py-3.5 transition-colors",
        isSelected ? "border-foreground ring-1 ring-foreground" : "border-border",
      )}
    >
      <label htmlFor={id} className="flex cursor-pointer items-center gap-3.5">
        <input
          id={id}
          type="radio"
          name="source"
          value={value}
          checked={isSelected}
          onChange={() => onSelect(value)}
          className="size-4 shrink-0 accent-foreground"
        />
        <span className="flex flex-col">
          <span className="text-[15px] font-medium">{title}</span>
          <span className="text-sm text-muted-foreground">{hint}</span>
        </span>
      </label>
      {isSelected && children && <div className="mt-3 pl-[30px]">{children}</div>}
    </div>
  );
}

/** Your agent comes later; it shows what is coming but cannot be chosen yet. */
function AgentOption() {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border px-4 py-3.5 opacity-60">
      <input
        id="ai-source-agent"
        type="radio"
        name="source"
        disabled
        className="size-4 shrink-0"
        aria-describedby="ai-source-agent-soon"
      />
      <label htmlFor="ai-source-agent" className="flex flex-1 flex-col">
        <span className="text-[15px] font-medium">{t("setup.ai.agent")}</span>
        <span className="text-sm text-muted-foreground">{t("setup.ai.agentHint")}</span>
      </label>
      <span
        id="ai-source-agent-soon"
        className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
      >
        {t("setup.ai.comingSoon")}
      </span>
    </div>
  );
}

function KeyField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (key: string) => void;
  error: string | undefined;
}) {
  return (
    <div className="flex max-w-md flex-col gap-2">
      <Label htmlFor="openrouter-key">{t("setup.ai.apiKey")}</Label>
      <Input
        id="openrouter-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        placeholder={t("setup.ai.apiKeyPlaceholder")}
        className="h-10 rounded-lg"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={error ? "openrouter-key-error" : undefined}
      />
      <FieldError id="openrouter-key-error" message={error} />
      <p className="text-sm text-muted-foreground">
        {t("setup.ai.noKey")}{" "}
        <a
          href={CREATE_KEY_URL}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground underline underline-offset-2"
        >
          {t("setup.ai.createKey")}
        </a>
        .
      </p>
    </div>
  );
}

/** The key OpenRouter is already used with; Replace asks for another. */
function KnownKey({ origin, onReplace }: { origin: AiKeyOrigin; onReplace: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1.5 text-sm text-brand-deep">
        <Check size={14} weight="bold" aria-hidden />
        {t(origin === "ENVIRONMENT" ? "setup.ai.keyFound" : "setup.ai.keySaved")}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onReplace}>
        {t("setup.ai.replace")}
      </Button>
    </div>
  );
}

function DemoDataCard({
  disabled,
  skipping,
  onUse,
}: {
  disabled: boolean;
  skipping: boolean;
  onUse: () => void;
}) {
  return (
    <div className="flex items-center gap-3.5 rounded-xl border border-border px-4 py-3.5">
      <UsersThree size={20} aria-hidden className="shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-medium">{t("setup.ai.demo")}</span>
        <span className="text-sm text-muted-foreground">{t("setup.ai.demoHint")}</span>
      </div>
      <Button type="button" variant="outline" disabled={disabled} onClick={onUse}>
        {t(skipping ? "setup.import.skipping" : "setup.ai.useDemo")}
      </Button>
    </div>
  );
}

function NextButton({ checking, disabled }: { checking: boolean; disabled: boolean }) {
  return (
    <Button type="submit" size="lg" className="h-10 px-4" disabled={disabled}>
      {t(checking ? "setup.ai.checking" : "setup.ai.next")}
    </Button>
  );
}

type ChooseAiError = NonNullable<ChooseAiMutation["setup"]["chooseAi"]["error"]>;

/** What went wrong, worded for the owner; `onKey` when it is about the pasted key. */
function failureOf(
  error: ChooseAiError | null,
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
