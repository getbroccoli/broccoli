import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Why the last save was refused; none shows the hint. */
  error: string | null;
};

/** The terms' name, with its hint or the reason a save was refused. */
export function TermsNameField({ value, onChange, error }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="terms-name">{t("terms.name")}</Label>
      <Input
        id="terms-name"
        value={value}
        autoFocus
        aria-invalid={error !== null}
        aria-describedby="terms-name-note"
        onChange={(event) => onChange(event.target.value)}
      />
      <p
        id="terms-name-note"
        role={error ? "alert" : undefined}
        className={error ? "text-[13px] text-destructive" : "text-[13px] text-muted-foreground"}
      >
        {error ?? t("terms.name.hint")}
      </p>
    </div>
  );
}
