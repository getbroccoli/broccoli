import { useMutation } from "@apollo/client/react";
import { SlackLogo } from "@phosphor-icons/react";
import { useState } from "react";

import { RefreshSlackDocument, type ImportStepQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Where the browser starts connecting Slack; the API sends it on to Slack. */
export const CONNECT_SLACK_URL = "/api/integrations/slack/connect";

interface SlackSourceRowProps {
  /** The Slack source, or undefined before Slack is connected. */
  source: ImportStepQuery["import"]["sources"][number] | undefined;
}

/** Slack as a source of people: connect it, or see its workspace and read it again. */
export function SlackSourceRow({ source }: SlackSourceRowProps) {
  const [refreshSlack, { loading: refreshing }] = useMutation(RefreshSlackDocument);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const refresh = async () => {
    setRefreshFailed(false);
    try {
      await refreshSlack();
    } catch {
      setRefreshFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
        <SlackLogo size={22} weight="duotone" aria-hidden className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-medium">{t("imports.slack.name")}</span>
          <span className="truncate text-[13px] text-muted-foreground">
            {source ? peopleLine(source) : t("imports.slack.hint")}
          </span>
        </div>
        {source ? (
          <Button
            type="button"
            variant="outline"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            {t(refreshing ? "imports.slack.refreshing" : "imports.slack.refresh")}
          </Button>
        ) : (
          <Button render={<a href={CONNECT_SLACK_URL} />}>{t("imports.slack.connect")}</Button>
        )}
      </div>
      {source && (
        <a
          href={CONNECT_SLACK_URL}
          className="self-end text-[13px] text-muted-foreground underline underline-offset-3 hover:text-foreground"
        >
          {t("imports.slack.connectAnother")}
        </a>
      )}
      {refreshFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t("imports.slack.refreshFailed")}
        </p>
      )}
    </div>
  );
}

function peopleLine({ name, employeeCount }: { name: string; employeeCount: number }): string {
  return employeeCount === 1
    ? t("imports.slack.onePerson", { name })
    : t("imports.slack.people", { name, count: String(employeeCount) });
}
