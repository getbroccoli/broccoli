import { useState } from "react";
import { toast } from "sonner";

import { SetManagersDocument, type SetManagersMutation } from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { t } from "@/i18n";

import { addEmployeeHistoryLines } from "./cache";
import { EmployeeSearch } from "./EmployeePicker";
import { type PersonOption, personName } from "./PersonSearch";

type Props = {
  employeeIds: string[];
  /** Called once the managers are set, to clear the selection. */
  onSet: () => void;
};

/** The bulk bar's Set manager: picks one person, or none, as the manager of everyone selected. */
export function SetManagersButton({ employeeIds, onSet }: Props) {
  const [open, setOpen] = useState(false);
  const [setManagers, { loading }] = usePayloadMutation(SetManagersDocument, {
    update: (cache, { data }) =>
      addEmployeeHistoryLines(cache, data?.employee.setManagers.historyLines ?? []),
  });

  const pick = (manager: PersonOption | null) => {
    setOpen(false);
    const people =
      employeeIds.length === 1
        ? t("people.bulk.countOne")
        : t("people.bulk.count", { count: String(employeeIds.length) });
    setManagers({ variables: { input: { employeeIds, managerId: manager?.id ?? null } } }).then(
      () => {
        onSet();
        toast(
          manager
            ? t("people.bulk.managerSet", { name: personName(manager), people })
            : t("people.bulk.managerCleared", { people }),
        );
      },
      (failure: unknown) => toast.error(errorMessage(failure)),
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="sm" variant="outline" disabled={loading} />}>
        {t("people.bulk.setManager")}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <EmployeeSearch label={t("people.bulk.setManager")} selectedId="" onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}

type SetManagersError = SetManagersMutation["employee"]["setManagers"]["error"];

/** A loop is the one refusal the person can act on: they picked someone below the selected people. */
function errorMessage(failure: unknown): string {
  const refused =
    failure instanceof PayloadFailure ? (failure.payloadError as SetManagersError) : null;
  const code = refused?.__typename === "InvalidInputError" ? refused.fields[0]?.code : undefined;
  return code === "loop" ? t("people.bulk.managerLoop") : t("people.bulk.managerFailed");
}
