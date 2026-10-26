import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t, type MessageKey } from "@/i18n";

import { DEFAULT_REDIRECT } from "./loginSearch";
import { requestPasswordReset, type PasswordResetRequestResult } from "./authApi";

const forgotSchema = z.object({ email: z.email(t("auth.login.emailInvalid")) });

const FAILURE_MESSAGES: Record<Exclude<PasswordResetRequestResult, "ok">, MessageKey> = {
  tooManyAttempts: "auth.login.tooManyAttempts",
  failed: "auth.forgot.failed",
};

/** Asks for a reset link; the answer is the same whether or not the address has an account. */
export function ForgotPasswordForm() {
  const [result, setResult] = useState<PasswordResetRequestResult | null>(null);
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: forgotSchema },
    onSubmit: async ({ value }) => setResult(await requestPasswordReset(value.email)),
  });

  if (result === "ok") {
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm">
          {t("auth.forgot.sent")}
        </p>
        <BackToSignIn />
      </div>
    );
  }
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field name="email">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="forgot-email">{t("auth.login.email")}</Label>
            <Input
              id="forgot-email"
              name="username"
              type="email"
              autoComplete="username"
              autoFocus
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby={
                field.state.meta.errors.length > 0 ? "forgot-email-error" : undefined
              }
            />
            <FieldError id="forgot-email-error" message={field.state.meta.errors[0]?.message} />
          </div>
        )}
      </form.Field>
      {result && (
        <p role="alert" className="text-sm text-destructive">
          {t(FAILURE_MESSAGES[result])}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
          </Button>
        )}
      </form.Subscribe>
      <BackToSignIn />
    </form>
  );
}

function BackToSignIn() {
  return (
    <Link
      to="/login"
      search={{ redirect: DEFAULT_REDIRECT }}
      className="text-sm font-medium underline underline-offset-2"
    >
      {t("auth.forgot.backToSignIn")}
    </Link>
  );
}
