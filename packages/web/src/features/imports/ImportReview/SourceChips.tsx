import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";

import {
  SourceChips_SourceFragmentDoc,
  type SourceChips_SourceFragment,
} from "@/__generated__/graphql";
import { t } from "@/i18n";

import { SourceIcon } from "./SourceIcon";

/** "Details came from" and a chip per source; owns the `SourceChips_source` fragment. */
export function SourceChips({
  sources: from,
}: {
  sources: FragmentType<SourceChips_SourceFragment>[];
}) {
  const { data: sources, complete } = useFragment({
    fragment: SourceChips_SourceFragmentDoc,
    from,
  });
  if (!complete) return null;
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
              <SourceIcon source={source} />
            </span>
            {source.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
