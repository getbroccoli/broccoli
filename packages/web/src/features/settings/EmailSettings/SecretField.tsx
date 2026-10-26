import { Check } from "@phosphor-icons/react";

import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

type Props = {
  label: string;
  hint?: string;
  /** What is typed; null while the saved secret is kept. */
  value: string | null;
  onChange: (secret: string) => void;
  error: string | undefined;
};

/** The SMTP URL or Resend key: "Saved" with Replace while kept, since it is never shown again. */
export function SecretField({ label, hint, value, onChange, error }: Props) {
  if (value === null) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-sm text-brand-deep">
            <Check size={14} weight="bold" aria-hidden />
            {t("settings.email.secretSaved")}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange("")}>
            {t("settings.email.replace")}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="mail-secret">{label}</Label>
      <Input
        id="mail-secret"
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="h-10 rounded-lg"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={error ? "mail-secret-error" : hint ? "mail-secret-hint" : undefined}
      />
      <FieldError id="mail-secret-error" message={error} />
      {hint && !error && (
        <p id="mail-secret-hint" className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
