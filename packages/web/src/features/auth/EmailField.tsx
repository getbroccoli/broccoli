import { FieldError } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

type Props = {
  id: string;
  value: string;
  onChange: (email: string) => void;
  onBlur: () => void;
  error: string | undefined;
};

/** The sign-in email field, focused first and filled by password managers. */
export function EmailField({ id, value, onChange, onBlur, error }: Props) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{t("auth.login.email")}</Label>
      <Input
        id={id}
        name="username"
        type="email"
        autoComplete="username"
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        aria-invalid={error !== undefined}
        aria-describedby={error ? errorId : undefined}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}
