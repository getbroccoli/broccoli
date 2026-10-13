import { useMutation } from "@apollo/client/react";
import { SlackLogo } from "@phosphor-icons/react";
import { useState } from "react";

import { ReadSlackDocument, type ImportStepQuery } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

/** Where the browser starts connecting Slack; the API sends it on to Slack. */
export const CONNECT_SLACK_URL = "/api/integrations/slack/connect";

interface SlackSourceRowProps {
  /** The connected workspace, or null before Slack is connected. */
  connection: ImportStepQuery["slackConnection"];
  /** The Slack source, or undefined until its members are imported. */
  source: ImportStepQuery["import"]["sources"][number] | undefined;
}

/** Slack as a source of people: connect it, import its members, and read it again. */
export function SlackSourceRow({ connection, source }: SlackSourceRowProps) {
  const [readSlack, { loading: reading }] = useMutation(ReadSlackDocument);
  const [readFailed, setReadFailed] = useState(false);

  const read = async () => {
    setReadFailed(false);
    try {
      await readSlack();
    } catch {
      setReadFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
        <SlackLogo size={22} weight="duotone" aria-hidden className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-medium">{t("imports.slack.name")}</span>
          <span className="text-[13px] text-muted-foreground">
            {connection ? workspaceLine(connection.workspaceName, source) : t("imports.slack.hint")}
          </span>
        </div>
        {connection ? (
          <Button
            type="button"
            variant={source ? "outline" : "default"}
            disabled={reading}
            onClick={() => void read()}
          >
            {t(readLabel(reading, source !== undefined))}
          </Button>
        ) : (
          <Button render={<a href={CONNECT_SLACK_URL} />}>{t("imports.slack.connect")}</Button>
        )}
      </div>
      {connection && (
        <a
          href={CONNECT_SLACK_URL}
          className="self-end text-[13px] text-muted-foreground underline underline-offset-3 hover:text-foreground"
        >
          {t("imports.slack.connectAnother")}
        </a>
      )}
      {readFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t("imports.slack.readFailed")}
        </p>
      )}
    </div>
  );
}

function workspaceLine(name: string, source: { employeeCount: number } | undefined): string {
  if (!source) {
    return name;
  }
  return source.employeeCount === 1
    ? t("imports.slack.onePerson", { name })
    : t("imports.slack.people", { name, count: String(source.employeeCount) });
}

function readLabel(reading: boolean, imported: boolean) {
  if (reading) {
    return imported ? "imports.slack.refreshing" : "imports.slack.importing";
  }
  return imported ? "imports.slack.refresh" : "imports.slack.import";
}
