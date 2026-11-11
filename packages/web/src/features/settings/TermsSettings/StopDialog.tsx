import { useState } from "react";
import { toast } from "sonner";

import { StopTermsTimeOffDocument } from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { t } from "@/i18n";
import { companyToday, shortDate } from "@/features/termsDisplay";

import { DateChoice } from "./DateChoice";
import { longDate, nextLeaveYear, peopleText } from "./termsDraft";
import { TERMS_REFETCH, type Terms, type TimeOffRow } from "./termsQueries";

type Props = {
  terms: Terms;
  row: TimeOffRow;
  onClose: () => void;
};

type DateOption = "TODAY" | "NEXT_LEAVE_YEAR" | "ANOTHER_DATE";

/**
 * Stopping a type on the terms from a date, the start of the next leave year unless changed, so
 * this year's booked time off stays.
 */
export function StopDialog({ terms, row, onClose }: Props) {
  const earliest = terms.earliestChange;
  const [choice, setChoice] = useState<DateOption>("NEXT_LEAVE_YEAR");
  const [otherDate, setOtherDate] = useState("");
  const [stop, { loading }] = usePayloadMutation(StopTermsTimeOffDocument, {
    refetch: TERMS_REFETCH,
  });
  const stopDate =
    choice === "TODAY"
      ? companyToday()
      : choice === "NEXT_LEAVE_YEAR"
        ? nextLeaveYear(earliest)
        : otherDate;
  const type = row.timeOffType.name;

  const confirm = async () => {
    try {
      const input = { termsId: terms.id, timeOffTypeId: row.timeOffType.id, stopDate };
      await stop({ variables: { input } });
      toast(t("terms.edit.stop.done", { type, terms: terms.name }));
      onClose();
    } catch (error) {
      const booked =
        error instanceof PayloadFailure &&
        (error as PayloadFailure<{ __typename: string }>).payloadError.__typename ===
          "ConflictError";
      toast.error(
        booked
          ? t("terms.edit.stop.booked", { type, terms: terms.name, date: shortDate(stopDate) })
          : t("terms.edit.saveFailed"),
      );
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent className="sm:max-w-lg" closeLabel={t("terms.close")}>
        <DialogTitle className="text-lg">
          {t("terms.edit.stop.title", { type, terms: terms.name })}
        </DialogTitle>
        <DateChoice
          name="stop-date"
          options={[
            { value: "TODAY", label: t("terms.edit.today") },
            { value: "NEXT_LEAVE_YEAR", label: shortDate(nextLeaveYear(earliest)) },
            { value: "ANOTHER_DATE", label: t("terms.edit.otherDate") },
          ]}
          selected={choice}
          onSelect={setChoice}
          hint={t("terms.edit.stop.hint")}
          picker={
            <DatePicker
              value={otherDate}
              fromDate={earliest}
              placeholder={t("terms.edit.pickDate")}
              aria-label={t("terms.edit.pickDate")}
              onChange={setOtherDate}
            />
          }
        />
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-[13px] text-muted-foreground">
            {stopDate &&
              t("terms.edit.stop.saveLine", {
                type,
                people: peopleText(terms.peopleCount),
                terms: terms.name,
                date: longDate(stopDate),
              })}
          </p>
          <div className="flex gap-2">
            <DialogClose render={<Button type="button" variant="outline" disabled={loading} />}>
              {t("terms.edit.cancel")}
            </DialogClose>
            <Button onClick={() => void confirm()} disabled={!stopDate || loading}>
              {t("terms.edit.stop.confirm")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
