import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/i18n";

import { ImportPersonSearch } from "./ImportPersonSearch";
import { useChooseManager } from "./useChooseManager";

type Props = {
  employeeIds: string[];
  /** Called once the manager is chosen, to clear the selection. */
  onChosen: () => void;
};

/** The review's bulk Set manager: picks one person, or none, as the manager of everyone selected. */
export function ChooseManagerButton({ employeeIds, onChosen }: Props) {
  const [open, setOpen] = useState(false);
  const { choose, loading } = useChooseManager();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="sm" disabled={loading} />}>
        {t("setup.review.bulk.setManager")}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <ImportPersonSearch
          label={t("setup.review.bulk.setManager")}
          selectedId=""
          onPick={(person) => {
            setOpen(false);
            void choose(employeeIds, person).then((chosen) => chosen && onChosen());
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
