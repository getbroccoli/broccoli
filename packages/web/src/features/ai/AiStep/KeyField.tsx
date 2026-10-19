import { FieldError } from "@/components/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

/** The OpenRouter key field, with where to get a key. */
export function KeyField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (key: string) => void;
  error: string | undefined;
}) {
  return (
    <div className="flex max-w-md flex-col gap-2">
      <Label htmlFor="openrouter-key">{t("setup.ai.apiKey")}</Label>
      <Input
        id="openrouter-key"
        type="password"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        placeholder={t("setup.ai.apiKeyPlaceholder")}
        className="h-10 rounded-lg"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={error ? "openrouter-key-error" : undefined}
      />
      <FieldError id="openrouter-key-error" message={error} />
      <p className="text-sm text-muted-foreground">
        {t("setup.ai.noKey")}{" "}
        <a
          href={CREATE_KEY_URL}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-foreground underline underline-offset-2"
        >
          {t("setup.ai.createKey")}
        </a>
        .
      </p>
    </div>
  );
}

const CREATE_KEY_URL = "https://openrouter.ai/keys";
