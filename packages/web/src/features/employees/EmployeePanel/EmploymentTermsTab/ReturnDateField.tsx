import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

type Props = {
  value: string;
  earliest: string;
  hint: string;
  onChange: (startDate: string) => void;
};

/** "Applies from" alone, for a return to the terms' week or rules. */
export function ReturnDateField({ value, earliest, hint, onChange }: Props) {
  return (
    <div className="flex max-w-64 flex-col gap-1.5">
      <Label>{t("changeTerms.appliesFrom")}</Label>
      <DatePicker
        value={value}
        fromDate={earliest}
        placeholder={t("changeTerms.appliesFrom")}
        aria-label={t("changeTerms.appliesFrom")}
        // A return needs a date: picking the chosen day again keeps it.
        onChange={(startDate) => startDate && onChange(startDate)}
      />
      <p className="text-[13px] text-muted-foreground">{hint}</p>
    </div>
  );
}
