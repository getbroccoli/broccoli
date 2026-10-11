import { MagnifyingGlass } from "@phosphor-icons/react";

import { TableState } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

export function NoMatchingEmployees({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <TableState
      icon={MagnifyingGlass}
      title={t("people.noResults.title", { query })}
      action={
        <Button variant="outline" size="sm" onClick={onClear}>
          {t("people.noResults.clear")}
        </Button>
      }
    />
  );
}
