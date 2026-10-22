import type { FragmentType } from "@apollo/client";
import { useFragment } from "@apollo/client/react";
import { X } from "@phosphor-icons/react";
import { useState } from "react";

import {
  ImportReviewDocument,
  SourceChips_SourceFragmentDoc,
  type SourceChips_SourceFragment,
} from "@/__generated__/graphql";
import { t } from "@/i18n";

import { RemoveSourceDialog } from "../RemoveSourceDialog";
import { SourceIcon } from "./SourceIcon";

/** Review's query, loaded again so the removed source's people leave the list. */
const REFETCH_AFTER_REMOVE = [ImportReviewDocument];

/**
 * "Details came from" and a chip per source, each removable after a confirmation; owns the
 * `SourceChips_source` fragment.
 */
export function SourceChips({
  sources: from,
}: {
  sources: FragmentType<SourceChips_SourceFragment>[];
}) {
  const { data: sources, complete } = useFragment({
    fragment: SourceChips_SourceFragmentDoc,
    from,
  });
  const [removing, setRemoving] = useState<SourceChips_SourceFragment | null>(null);
  if (!complete) return null;
  return (
    <div className="flex flex-wrap items-center gap-2.5 text-sm text-muted-foreground">
      <span>{t("setup.review.cameFrom")}</span>
      <ul className="flex flex-wrap gap-2">
        {sources.map((source) => (
          <li
            key={source.id}
            className="inline-flex h-8 items-center gap-2 rounded-full bg-card pr-1 pl-1 text-[13px] font-medium text-foreground ring-1 ring-border"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-muted">
              <SourceIcon source={source} />
            </span>
            {source.name}
            <button
              type="button"
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("imports.removeSource.openNamed", { name: source.name })}
              onClick={() => setRemoving(source)}
            >
              <X size={12} weight="bold" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <RemoveSourceDialog
        source={removing}
        onClose={() => setRemoving(null)}
        refetch={REFETCH_AFTER_REMOVE}
      />
    </div>
  );
}
