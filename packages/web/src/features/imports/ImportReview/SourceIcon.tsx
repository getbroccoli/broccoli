import { FileCsv } from "@phosphor-icons/react";

import type { ImportSourceKind } from "@/__generated__/graphql";

import { SlackMark } from "../SlackMark";

/** The mark of a source's kind: Slack's logo or a CSV file. */
export function SourceIcon({ kind }: { kind: ImportSourceKind }) {
  return kind === "SLACK" ? (
    <SlackMark size={12} />
  ) : (
    <FileCsv size={12} weight="duotone" aria-hidden className="shrink-0 text-brand-deep" />
  );
}
