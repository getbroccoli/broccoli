import { useQuery } from "@apollo/client/react";

import { ChangeTermsFormTermsDocument } from "@/__generated__/graphql";
import { FieldError } from "@/components/form";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

type Props = {
  value: { termsId: string | null; startDate: string };
  onChange: (value: { termsId: string | null; startDate: string }) => void;
  /** The earliest date a move may apply from. */
  earliest: string;
  /** The terms the person is on now, shown with "(now)" and not offered; none for many people. */
  currentTermsId?: string | null;
  /** What the date means, such as "Earlier days stay on England and Wales." */
  hint: string;
  error?: string | null;
  disabled?: boolean;
};

/** Terms and the date they apply from: the form for moving one person, or many, to other terms. */
export function ChangeTermsForm({
  value,
  onChange,
  earliest,
  currentTermsId,
  hint,
  error,
  disabled,
}: Props) {
  // Terms change in Settings, so the list reloads each time the form opens.
  const { data } = useQuery(ChangeTermsFormTermsDocument, { fetchPolicy: "cache-and-network" });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="change-terms-terms">{t("changeTerms.terms")}</Label>
          <select
            id="change-terms-terms"
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            value={value.termsId ?? ""}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, termsId: event.target.value || null })}
          >
            <option value="" disabled>
              {t("changeTerms.pick")}
            </option>
            {data?.allTerms.map(({ id, name }) => (
              <option key={id} value={id} disabled={id === currentTermsId}>
                {id === currentTermsId ? t("changeTerms.now", { terms: name }) : name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium">{t("changeTerms.appliesFrom")}</span>
          <DatePicker
            value={value.startDate}
            fromDate={earliest}
            placeholder={t("changeTerms.appliesFrom")}
            aria-label={t("changeTerms.appliesFrom")}
            aria-invalid={Boolean(error)}
            onChange={(startDate) => onChange({ ...value, startDate })}
          />
        </div>
      </div>
      <p className="text-[13px] text-muted-foreground">{hint}</p>
      <FieldError id="change-terms-error" message={error ?? undefined} />
    </div>
  );
}
