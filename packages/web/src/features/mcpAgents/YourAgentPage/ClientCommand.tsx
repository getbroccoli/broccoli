import { t } from "@/i18n";

import { CopyableText } from "./CopyableText";

type Props = {
  client: string;
  /** The command that adds Broccoli to the client. */
  line: string;
  /** What to do after running it. */
  then: string;
};

/** One client's command to copy, and the sign-in step after it. */
export function ClientCommand({ client, line, then }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{client}</span>
      <CopyableText text={line} copyLabel={t("mcpAgents.cli.copyCommand")} wrap />
      <span className="text-xs text-muted-foreground">{then}</span>
    </div>
  );
}
