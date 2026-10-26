import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";

import { DEFAULT_REDIRECT } from "./loginSearch";
import { EmailField } from "./EmailField";
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
          <EmailField
            id="forgot-email"
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            error={field.state.meta.errors[0]?.message}
          />
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
