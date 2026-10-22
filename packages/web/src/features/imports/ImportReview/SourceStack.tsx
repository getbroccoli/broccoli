import type { ImportSourceKind } from "@/__generated__/graphql";

import { SourceIcon } from "./SourceIcon";

/** The sources of an import employee as overlapping marks, their names on hover. */
export function SourceStack({
  sources,
}: {
  sources: { id: string; kind: ImportSourceKind; name: string }[];
}) {
  const names = sources.map(({ name }) => name).join(", ");
  return (
    <span className="flex items-center" title={names} aria-label={names}>
      {sources.map((source, index) => (
        <span
          key={source.id}
          className="-ml-1.5 flex size-7 items-center justify-center rounded-full bg-muted ring-2 ring-card first:ml-0"
          style={{ zIndex: sources.length - index }}
        >
          <SourceIcon source={source} />
        </span>
      ))}
    </span>
  );
}
