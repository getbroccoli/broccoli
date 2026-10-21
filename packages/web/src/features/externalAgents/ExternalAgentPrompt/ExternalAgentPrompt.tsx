import { useCallback, useEffect, useRef, useState } from "react";

import { CreateExternalAgentCodeDocument } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { isExternalAgentSafeOrigin } from "../externalAgentOrigin";
import { ExternalAgentPromptBlock } from "../ExternalAgentPromptBlock";

/**
 * Connecting the owner's agent on the import step: the prompt with a one-time code, made as the
 * page opens and again once it expires, and the wait for the agent. Shown only while no agent is
 * connected, since a new code ends that agent's session. Off https and this computer it shows no
 * code and waits for the agent to connect from the server.
 */
export function ExternalAgentPrompt() {
  const onSafeAddress = isExternalAgentSafeOrigin(window.location.origin);
  const { code, failed, retry } = useExternalAgentCode(onSafeAddress);

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border border-border p-[18px]">
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-medium">{t("externalAgents.connectTitle")}</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t(onSafeAddress ? "externalAgents.connectHint" : "externalAgents.connectHintOnServer")}
        </p>
      </div>
      {onSafeAddress && (
        <ExternalAgentPromptBlock
          prompt={
            code && !failed
              ? t("externalAgents.sentence", { origin: window.location.origin, code: code.code })
              : null
          }
        />
      )}
      {failed ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          {t("externalAgents.failed")}
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            {t("externalAgents.retry")}
          </Button>
        </div>
      ) : (
        <p role="status" className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <span
            aria-hidden
            className="size-3 shrink-0 animate-spin rounded-full border-2 border-border border-t-foreground"
          />
          {t(onSafeAddress ? "externalAgents.waiting" : "externalAgents.waitingOnServer")}
        </p>
      )}
    </div>
  );
}

/** The code requests of every mounted prompt, in the order they were asked for. */
let codeRequests: Promise<unknown> = Promise.resolve();

/**
 * Keeps a valid one-time code while the prompt shows and `enabled`: one now, a new one when it
 * expires. `retry` starts over after a failure.
 */
function useExternalAgentCode(enabled: boolean) {
  const [createExternalAgentCode, creating] = usePayloadMutation(CreateExternalAgentCodeDocument);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const stopRenewing = useRef(() => {});

  const start = useCallback(() => {
    stopRenewing.current();
    let stopped = false;
    let renewal: ReturnType<typeof setTimeout> | undefined;
    const renew = () => {
      setCode(null);
      // A new code cancels every earlier one, so requests wait for each other: the last one asked
      // for, the one shown, also commits last. React's strict mode mounts twice.
      const request = codeRequests.then(() => createExternalAgentCode());
      codeRequests = request.catch(() => {});
      request.then(
        ({ externalAgentCode }) => {
          if (stopped || !externalAgentCode) {
            return;
          }
          setCode(externalAgentCode);
          renewal = setTimeout(renew, Date.parse(externalAgentCode.expiresAt) - Date.now());
        },
        () => {}, // The hook keeps the error for display.
      );
    };
    renew();
    stopRenewing.current = () => {
      stopped = true;
      clearTimeout(renewal);
    };
  }, [createExternalAgentCode]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    start();
    return () => stopRenewing.current();
  }, [enabled, start]);

  return { code, failed: Boolean(creating.error || creating.payloadError), retry: start };
}
