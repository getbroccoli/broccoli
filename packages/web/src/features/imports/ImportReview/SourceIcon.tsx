import { FileCsv, SlackLogo } from "@phosphor-icons/react";

import type { ImportSourceKind } from "@/__generated__/graphql";

/** The mark of a source's kind: Slack's logo or a CSV file. */
export function SourceIcon({ kind }: { kind: ImportSourceKind }) {
  const Icon = kind === "SLACK" ? SlackLogo : FileCsv;
  return <Icon size={12} weight="duotone" aria-hidden className="shrink-0" />;
}
