import { useState } from "react";
import { toast } from "sonner";

import {
  SaveMailSettingsDocument,
  type EmailSettingsQuery,
  type MailSource,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { FieldError, OptionCard } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";

import { failureOf } from "./failureOf";
import { SecretField } from "./SecretField";
import { TestEmailButton } from "./TestEmailButton";

type Props = {
  mail: NonNullable<EmailSettingsQuery["setup"]["mail"]>;
};

/** The three ways to send email; saving an SMTP server first checks that it accepts the sign-in. */
export function EmailForm({ mail }: Props) {
  const [source, setSource] = useState<MailSource>(mail.source);
  const [from, setFrom] = useState(mail.from ?? "");
  // What is typed for the secret; null keeps the saved one, and Replace starts typing.
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [save, { loading: saving, error, payloadError }] =
    usePayloadMutation(SaveMailSettingsDocument);
  // A secret belongs to its provider, so another provider starts from an empty field.
  const selectSource = (next: MailSource) => {
    setSource(next);
    setNewSecret(null);
  };
  const keepsSecret = newSecret === null && source === mail.source && mail.hasSecret;
  const failure = payloadError
    ? failureOf(payloadError, source)
    : error
      ? { message: "settings.email.failed" as const, field: null }
      : null;
  const fieldError = (field: "from" | "secret") =>
    failure?.field === field ? t(failure.message) : undefined;

  const submit = async () => {
    try {
      await save({
        variables: {
          input: { source, from, secret: keepsSecret ? null : (newSecret ?? "") },
        },
      });
      setNewSecret(null);
      toast.success(t("settings.email.saved"));
    } catch {
      // `usePayloadMutation` keeps the failure for display.
    }
  };

  const fields = (
    <div className="flex max-w-md flex-col gap-4">
      <SecretField
        label={t(source === "SMTP_SERVER" ? "settings.email.smtpUrl" : "settings.email.resendKey")}
        hint={source === "SMTP_SERVER" ? t("settings.email.smtpUrlHint") : undefined}
        value={keepsSecret ? null : (newSecret ?? "")}
        onChange={setNewSecret}
        error={fieldError("secret")}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="mail-from">{t("settings.email.from")}</Label>
        <Input
          id="mail-from"
          type="email"
          autoComplete="off"
          className="h-10 rounded-lg"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          aria-invalid={fieldError("from") !== undefined}
          aria-describedby={fieldError("from") ? "mail-from-error" : "mail-from-hint"}
        />
        <FieldError id="mail-from-error" message={fieldError("from")} />
        {!fieldError("from") && (
          <p id="mail-from-hint" className="text-sm text-muted-foreground">
            {t("settings.email.fromHint")}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset className="flex flex-col gap-3" disabled={saving}>
        <legend className="sr-only">{t("settings.email.options")}</legend>
        <OptionCard
          name="mail-source"
          value="SMTP_SERVER"
          selected={source}
          onSelect={selectSource}
          title={t("settings.email.smtp")}
          hint={t("settings.email.smtpHint")}
        >
          {fields}
        </OptionCard>
        <OptionCard
          name="mail-source"
          value="RESEND_API"
          selected={source}
          onSelect={selectSource}
          title={t("settings.email.resend")}
          hint={t("settings.email.resendHint")}
        >
          {fields}
        </OptionCard>
        <OptionCard
          name="mail-source"
          value="NO_EMAIL"
          selected={source}
          onSelect={selectSource}
          title={t("settings.email.noEmail")}
          hint={t("settings.email.noEmailHint")}
        />
      </fieldset>
      {failure && failure.field === null && (
        <p role="alert" className="text-sm text-destructive">
          {t(failure.message)}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <Button type="submit" disabled={saving}>
          {t(saveLabel(source, saving))}
        </Button>
        {mail.source !== "NO_EMAIL" && <TestEmailButton disabled={saving} />}
      </div>
    </form>
  );
}

function saveLabel(source: MailSource, saving: boolean) {
  if (source === "SMTP_SERVER") {
    return saving ? "settings.email.checking" : "settings.email.checkAndSave";
  }
  return saving ? "settings.email.saving" : "settings.email.save";
}
