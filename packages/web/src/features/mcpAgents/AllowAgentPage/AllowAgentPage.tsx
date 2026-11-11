import { useQuery } from "@apollo/client/react";
import { Check, Robot } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { AllowAgentDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth";
import { t, type MessageKey } from "@/i18n";
import { AuthCard } from "@/shell";

import { answerAgent, readAgentClientName } from "./allowAgentApi";

const PROMISES: readonly MessageKey[] = [
  "mcpAgents.allow.reads",
  "mcpAgents.allow.neverApproves",
  "mcpAgents.allow.disconnect",
];

/**
 * Where a person allows their own agent to act as them, opened by Broccoli's OAuth server with the
 * agent's request signed in the query. Either answer sends the browser back to the agent.
 */
export function AllowAgentPage() {
  const signedRequest = window.location.search.slice(1);
  const clientId = new URLSearchParams(signedRequest).get("client_id") ?? "";
  const clientName = useAgentClientName(clientId);
  const { data } = useQuery(AllowAgentDocument);
  const [answering, setAnswering] = useState(false);
  const [outcome, setOutcome] = useState<"expired" | "failed" | null>(null);
  const client = clientName ?? t("mcpAgents.allow.unnamedClient");
  const replaced = data?.myAgentConnection;
  const me = data?.me;
  const employee = me?.employee;

  const answer = async (allow: boolean) => {
    setAnswering(true);
    const result = await answerAgent(allow, signedRequest);
    if (typeof result === "object") {
      window.location.assign(result.returnTo);
      return;
    }
    setOutcome(result);
    setAnswering(false);
  };

  if (outcome === "expired") {
    return (
      <AuthCard
        title={t("mcpAgents.expired.title")}
        description={t("mcpAgents.expired.description")}
      >
        {null}
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t("mcpAgents.allow.title", { client })}>
      <div className="flex flex-col gap-5">
        {clientName && (
          <p className="text-xs text-muted-foreground">
            {t("mcpAgents.allow.clientNamed", { client: clientName })}
          </p>
        )}
        <div className="flex items-center gap-3 rounded-xl bg-app-backdrop px-3 py-2.5">
          <Robot size={20} className="text-brand-deep" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-medium">
              {employee ? `${employee.firstName} ${employee.lastName}` : me?.email}
            </span>
            {employee && (
              <span className="truncate text-xs text-muted-foreground">{me?.email}</span>
            )}
          </span>
          <button
            type="button"
            className="text-xs underline-offset-2 hover:underline"
            onClick={() =>
              void signInAsSomeoneElse().then((signedOut) => signedOut || setOutcome("failed"))
            }
          >
            {t("mcpAgents.allow.notYou")}
          </button>
        </div>
        <ul className="flex flex-col gap-2.5 text-sm">
          {PROMISES.map((promise) => (
            <li key={promise} className="flex gap-2.5">
              <Check size={16} weight="bold" className="mt-0.5 shrink-0 text-brand" aria-hidden />
              {t(promise)}
            </li>
          ))}
        </ul>
        {replaced && (
          <p role="note" className="rounded-lg border px-3 py-2.5 text-sm">
            {t("mcpAgents.allow.replaces", {
              client: replaced.clientName ?? t("mcpAgents.allow.unnamedClient"),
              date: dayAndMonthOf(replaced.connectedAt),
            })}
          </p>
        )}
        {outcome === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            {t("mcpAgents.allow.failed")}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={answering}
            onClick={() => void answer(false)}
          >
            {t("mcpAgents.allow.cancel")}
          </Button>
          <Button className="flex-1" disabled={answering} onClick={() => void answer(true)}>
            {t("mcpAgents.allow.allow")}
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {t("mcpAgents.allow.noPassword")}
        </p>
      </div>
    </AuthCard>
  );
}

/** The name the agent's app gave itself, read once the page opens; null until then or without one. */
function useAgentClientName(clientId: string): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void readAgentClientName(clientId).then((read) => current && setName(read));
    return () => {
      current = false;
    };
  }, [clientId]);
  return name;
}

/**
 * Signs out and shows sign-in with the agent's request, so the right person allows it; false when
 * signing out failed, leaving the page as it is.
 */
async function signInAsSomeoneElse(): Promise<boolean> {
  if (!(await signOut())) return false;
  window.location.assign(`/login${window.location.search}`);
  return true;
}

function dayAndMonthOf(dateTime: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(dateTime),
  );
}
