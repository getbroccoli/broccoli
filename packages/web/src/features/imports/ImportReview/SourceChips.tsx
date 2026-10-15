import type { ImportSourceKind } from "@/__generated__/graphql";
import { t } from "@/i18n";

import { SourceIcon } from "./SourceIcon";

interface Source {
  id: string;
  kind: ImportSourceKind;
  name: string;
}

/** "Details came from" and a chip per source that has people. */
export function SourceChips({ sources }: { sources: Source[] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>{t("setup.review.cameFrom")}</span>
      <ul className="flex flex-wrap gap-1.5">
        {sources.map((source) => (
          <li
            key={source.id}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-[13px] text-foreground"
          >
            <SourceIcon kind={source.kind} />
            {source.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
