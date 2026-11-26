import { CaretDown } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

import type { DialogMode } from "@/features/employees";

import { TypeDot } from "./TypeDot";
import type { BookingDraft } from "./useBookingDraft";

type Props = { draft: BookingDraft; firstName: string; mode: DialogMode };

/** The types offered to the person, each with what is left of it. */
export function TypeMenu({ draft, firstName, mode }: Props) {
  const types = draft.types ?? [];
  const chosen = types.find(({ timeOffType }) => timeOffType.id === draft.typeId);
  if (draft.types && types.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {mode === "book"
          ? t("timeOff.dialog.noTypes", { name: firstName })
          : t("timeOff.dialog.noRequestTypes")}
      </p>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={types.length === 0}
            className="justify-between font-normal"
          />
        }
      >
        {chosen ? (
          <span className="flex items-center gap-2">
            <TypeDot colour={chosen.timeOffType.colour} />
            {chosen.timeOffType.name}
          </span>
        ) : (
          <span className="text-muted-foreground">{t("timeOff.dialog.pickType")}</span>
        )}
        <CaretDown aria-hidden className="text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {types.map(({ timeOffType, balance, entitlement, remaining }) => (
          <DropdownMenuItem
            key={timeOffType.id}
            onClick={() => draft.setTypeId(timeOffType.id)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="flex items-center gap-2 font-medium">
              <TypeDot colour={timeOffType.colour} />
              {timeOffType.name}
            </span>
            {balance && (
              <span className="pl-4 text-xs text-muted-foreground tabular-nums">
                {balance === "BALANCE_FROM_ALLOWANCE"
                  ? t("timeOff.dialog.typeLeft", {
                      left: String(remaining ?? 0),
                      total: String(entitlement ?? 0),
                    })
                  : balance === "UNLIMITED_BALANCE"
                    ? t("timeOff.dialog.typeUnlimited")
                    : t("timeOff.dialog.typeDoesntCount")}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
