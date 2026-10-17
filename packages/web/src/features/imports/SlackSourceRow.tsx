import { DotsThree, LockSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import { ReadSlackDocument, type ImportStepQuery } from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { SlackMark } from "./SlackMark";

/** Where the browser starts connecting Slack; the API sends it on to Slack. */
export const CONNECT_SLACK_URL = "/api/integrations/slack/connect";

interface SlackSourceRowProps {
  /** The connected workspace, or null before Slack is connected. */
  connection: ImportStepQuery["slackConnection"];
  /** The Slack source, or undefined until its members are imported. */
  source: ImportStepQuery["import"]["sources"][number] | undefined;
}

/**
 * Slack as a source of people: connect it, and read it again. A connected workspace
 * without imported members is imported as soon as the row shows it.
 */
export function SlackSourceRow({ connection, source }: SlackSourceRowProps) {
  const [readSlack, { loading: reading }] = usePayloadMutation(ReadSlackDocument);
  const [readFailed, setReadFailed] = useState(false);

  const read = async () => {
    setReadFailed(false);
    try {
      await readSlack();
    } catch {
      setReadFailed(true);
    }
  };

  // Once per visit: a failure leaves the button for the owner to try again.
  const autoImported = useRef(false);
  const needsImport = connection !== null && source === undefined;
  useEffect(() => {
    if (needsImport && !autoImported.current) {
      autoImported.current = true;
      void read();
    }
  });

  return (
    <section
      aria-labelledby="connect-tools-title"
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex flex-col gap-3 px-5 pt-5 pb-4">
        <div>
          <h2 id="connect-tools-title" className="text-[19px] font-semibold tracking-[-0.01em]">
            {t("imports.tools.title")}
          </h2>
          <p className="mt-1 max-w-[62ch] text-[15px] leading-[1.55] text-muted-foreground">
            {t("imports.tools.line")}
          </p>
        </div>
        <p className="flex items-center gap-2 self-start rounded-lg bg-brand-soft/60 px-3 py-2 text-sm text-brand-deep">
          <LockSimple size={16} weight="bold" aria-hidden className="shrink-0" />
          {t("imports.tools.readOnly")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card ring-1 ring-border">
          <SlackMark size={20} />
        </span>
        <div className="min-w-32 flex-1">
          <p className="text-[15px] font-semibold">{t("imports.slack.name")}</p>
          <p className="text-sm leading-[1.5] text-muted-foreground">
            {connection ? workspaceLine(connection.workspaceName, source) : t("imports.slack.hint")}
          </p>
        </div>
        {connection ? (
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={source ? "outline" : "default"}
              className="h-7 rounded-full px-3 text-[13px]"
              disabled={reading}
              onClick={() => void read()}
            >
              {t(readLabel(reading, source !== undefined))}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    aria-label={t("imports.slack.options")}
                  />
                }
              >
                <DotsThree weight="bold" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1.5">
                <DropdownMenuItem className="h-9 px-2.5" render={<a href={CONNECT_SLACK_URL} />}>
                  {t("imports.slack.connectAnother")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        ) : (
          <a
            href={CONNECT_SLACK_URL}
            className={cn(
              buttonVariants({ size: "sm" }),
              "ml-auto h-7 rounded-full px-3 text-[13px]",
            )}
          >
            {t("imports.slack.connect")}
          </a>
        )}
      </div>
      {readFailed && (
        <p role="alert" className="border-t border-border px-5 py-3 text-sm text-destructive">
          {t("imports.slack.readFailed")}
        </p>
      )}
    </section>
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
