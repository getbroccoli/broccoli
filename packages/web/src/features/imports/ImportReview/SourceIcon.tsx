import type { ImportSourceKind } from "@/__generated__/graphql";

import { FileIcon } from "../FileIcon";
import { SlackMark } from "../SlackMark";

/** The mark of a source: Slack's logo or its file's type. */
export function SourceIcon({ source }: { source: { kind: ImportSourceKind; name: string } }) {
  return source.kind === "SLACK" ? (
    <SlackMark size={12} />
  ) : (
    <FileIcon name={source.name} size={12} className="shrink-0 text-brand-deep" />
  );
}
