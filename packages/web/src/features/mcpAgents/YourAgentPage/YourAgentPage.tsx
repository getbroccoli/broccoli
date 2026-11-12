import { useQuery } from "@apollo/client/react";
import { useEffect } from "react";

import { YourAgentDocument } from "@/__generated__/graphql";
import { t } from "@/i18n";
import { PageHeader } from "@/shell";

import { ConnectAgentSteps } from "./ConnectAgentSteps";
import { ConnectedAgentCard } from "./ConnectedAgentCard";
import { CopyableText } from "./CopyableText";
import { LastEndingNote } from "./LastEndingNote";
import { SelfHostedNote } from "./SelfHostedNote";
import { WaitingForAgent } from "./WaitingForAgent";

/** Where a person connects their own agent, sees it connected, and disconnects it. */
export function YourAgentPage() {
  // An agent connects in another tab or app, so the page never trusts what an earlier visit cached.
  const { data, error, refetch } = useQuery(YourAgentDocument, {
    fetchPolicy: "cache-and-network",
  });
  useRefetchOnFocus(refetch);
  // The address the browser is on: the one an agent's token is issued for.
  const address = `${window.location.origin}/api/mcp`;
  const connection = data?.myAgentConnection;
  const ending = data?.myLastEndedAgentConnection;
  const me = data?.me;
  const employee = me?.employee;

  return (
    <div className="flex max-w-2xl flex-col">
      <PageHeader title={t("mcpAgents.page.title")} description={t("mcpAgents.page.description")} />
      {error && !data && (
        <p role="alert" className="text-sm text-destructive">
          {t("mcpAgents.page.failed")}
        </p>
      )}
      {data && connection && me && (
        <ConnectedAgentCard
          connection={connection}
          personName={employee ? `${employee.firstName} ${employee.lastName}` : me.email}
        />
      )}
      {data && !connection && (
        <div className="flex flex-col gap-6">
          {ending && <LastEndingNote ending={ending} />}
          <section aria-labelledby="your-agent-address" className="flex flex-col gap-2">
            <span id="your-agent-address" className="text-sm font-semibold">
              {t("mcpAgents.address.label")}
            </span>
            <CopyableText text={address} />
            {data.setup.mode === "SELF_HOSTED" && <SelfHostedNote />}
          </section>
          <ConnectAgentSteps address={address} />
          <WaitingForAgent />
        </div>
      )}
    </div>
  );
}

/** Reads the page again when the person comes back to the window, such as after Allow. */
function useRefetchOnFocus(refetch: () => unknown): void {
  useEffect(() => {
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);
}
