import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NewPasswordField } from "@/features/setup";
import { t, type MessageKey } from "@/i18n";
import { useSessionChange } from "@/lib/useSessionChange";

import { acceptInvite, type AcceptResult, type InviteDetails } from "./inviteApi";
import { formatExpiryDay } from "./signInStatus";

// The API's password policy.
const PASSWORD_LENGTH = { min: 8, max: 128 };

const joinSchema = z.object({
  password: z
    .string()
    .min(PASSWORD_LENGTH.min, t("invites.page.passwordTooShort"))
    .max(PASSWORD_LENGTH.max, t("invites.page.passwordTooLong")),
});

const FAILURE_MESSAGES: Record<Exclude<AcceptResult, "ok" | "invalid">, MessageKey> = {
  tooManyAttempts: "invites.page.tooManyAttempts",
  failed: "invites.page.failed",
};

type Props = {
  token: string;
  details: InviteDetails;
  /** Runs when the link stopped working while the page was open. */
  onInvalid: () => void;
};

/** The person chooses a password and joins; the route then takes them to their profile. */
export function InviteForm({ token, details, onInvalid }: Props) {
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [join, joining] = useSessionChange(async (password: string) => {
    setFailure(null);
    const result = await acceptInvite(token, password);
    if (result === "invalid") onInvalid();
    else if (result !== "ok") setFailure(FAILURE_MESSAGES[result]);
    return result === "ok";
  });
  const form = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: joinSchema },
    onSubmit: ({ value }) => join(value.password),
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-email">{t("invites.page.email")}</Label>
        <Input id="invite-email" value={details.email} readOnly autoComplete="username" />
      </div>
      <form.Field name="password">
        {(field) => (
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <NewPasswordField
                id="invite-password"
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                error={field.state.meta.errors[0]?.message}
                readOnly={isSubmitting || joining}
              />
            )}
          </form.Subscribe>
        )}
      </form.Field>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {t(failure)}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || joining}>
            {isSubmitting || joining
              ? t("invites.page.joining")
              : t("invites.page.join", { company: details.companyName })}
          </Button>
        )}
      </form.Subscribe>
      <p className="text-sm text-muted-foreground">
        {t("invites.page.footer", { date: formatExpiryDay(details.expiresAt) })}
      </p>
    </form>
  );
}
