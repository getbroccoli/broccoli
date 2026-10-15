import { CaretDoubleLeft, CaretRight } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export interface DataTablePager {
  hasNextPage: boolean;
  isFirstPage: boolean;
  /** Missing while the next page cannot be reached yet, such as during loading. */
  onNext: (() => void) | undefined;
  onFirst: () => void;
}

/** First page and Next page, for lists that page forward with a cursor. */
export function TablePager({ hasNextPage, isFirstPage, onNext, onFirst }: DataTablePager) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("table.firstPage")}
        title={t("table.firstPage")}
        disabled={isFirstPage}
        onClick={onFirst}
      >
        <CaretDoubleLeft size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("table.nextPage")}
        title={t("table.nextPage")}
        disabled={!hasNextPage || !onNext}
        onClick={onNext}
      >
        <CaretRight size={14} />
      </Button>
    </div>
  );
}
