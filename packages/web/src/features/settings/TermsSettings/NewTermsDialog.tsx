import { type FormEvent, useState } from "react";

import {
  type BankHolidayCalendar,
  CreateTermsDocument,
  EmploymentTermsDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

import { calendarName } from "./calendarName";
import { nameError } from "./termsText";
import { TermsNameField } from "./TermsNameField";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every set of terms' name, to name the one a taken name belongs to. */
  termsNames: readonly string[];
  /** The default terms' bank holidays today, which new terms start with unless changed. */
  defaultCalendar: BankHolidayCalendar;
  onCreated: (termsId: string) => void;
};

/** Asks for new terms' name and bank holidays; they start on a Mon–Fri week with no time off. */
export function NewTermsDialog({
  open,
  onOpenChange,
  termsNames,
  defaultCalendar,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [calendar, setCalendar] = useState(defaultCalendar);
  // The list is ordered by the server, so it reloads with the new terms in their place.
  const [createTerms, creation] = usePayloadMutation(CreateTermsDocument, {
    refetch: [EmploymentTermsDocument],
  });
  const failed = Boolean(creation.payloadError || creation.error);
  const code = creation.payloadError?.fields?.find(({ field }) => field === "name")?.code;

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const created = await createTerms({
      variables: { input: { name, bankHolidayCalendar: calendar } },
    }).catch(() => null);
    if (!created?.terms) return;
    clear();
    onCreated(created.terms.id);
  };

  // The dialog stays mounted under the list, so each opening starts empty.
  const clear = () => {
    setName("");
    setCalendar(defaultCalendar);
    creation.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (creation.loading) return;
        if (!nextOpen) clear();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-lg" closeLabel={t("terms.close")}>
        <form onSubmit={(event) => void create(event)} className="flex flex-col gap-5">
          <DialogTitle className="text-lg">{t("terms.new.title")}</DialogTitle>
          <TermsNameField
            value={name}
            onChange={setName}
            error={failed ? nameError(code, name, termsNames) : null}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="terms-calendar">{t("terms.new.bankHolidays")}</Label>
            <select
              id="terms-calendar"
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              value={calendar}
              onChange={(event) => setCalendar(event.target.value as BankHolidayCalendar)}
            >
              {CALENDARS.map((option) => (
                <option key={option} value={option}>
                  {calendarName(option)}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <p className="text-[13px] text-muted-foreground">{t("terms.new.note")}</p>
            <div className="flex gap-2">
              <DialogClose render={<Button type="button" variant="outline" />}>
                {t("terms.cancel")}
              </DialogClose>
              <Button type="submit" disabled={creation.loading}>
                {t("terms.new.create")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const CALENDARS = [
  "ENGLAND_AND_WALES",
  "SCOTLAND",
  "NORTHERN_IRELAND",
] as const satisfies BankHolidayCalendar[];
