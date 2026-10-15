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
    <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
      <span>{t("setup.review.cameFrom")}</span>
      <ul className="flex flex-wrap gap-2">
        {sources.map((source) => (
          <li
            key={source.id}
            className="inline-flex h-8 items-center gap-2 rounded-full bg-card pr-3 pl-1 text-[13px] font-medium text-foreground ring-1 ring-border"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-muted">
              <SourceIcon kind={source.kind} />
            </span>
            {source.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
