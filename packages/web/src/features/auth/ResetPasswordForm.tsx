import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { NewPasswordField } from "@/features/setup";
import { t, type MessageKey } from "@/i18n";

import { DEFAULT_REDIRECT } from "./loginSearch";
import { resetPassword, type PasswordResetResult } from "./authApi";

// The API's password policy.
const PASSWORD_LENGTH = { min: 8, max: 128 };

const resetSchema = z.object({
  password: z
    .string()
    .min(PASSWORD_LENGTH.min, t("setup.owner.passwordHint"))
    .max(PASSWORD_LENGTH.max, t("setup.owner.passwordTooLong")),
});

const FAILURE_MESSAGES: Record<Exclude<PasswordResetResult, "ok">, MessageKey> = {
  linkInvalid: "auth.reset.linkInvalid",
  failed: "auth.reset.failed",
};

/** A new password for the token in the link's fragment; then the person signs in with it. */
export function ResetPasswordForm() {
  const navigate = useNavigate();
  // The fragment never reaches the server; it is read once and then cleared from the address bar.
  const [token] = useState(() => window.location.hash.slice(1));
  const [failure, setFailure] = useState<Exclude<PasswordResetResult, "ok"> | null>(
    token === "" ? "linkInvalid" : null,
  );
  useEffect(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  const form = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: resetSchema },
    onSubmit: async ({ value }) => {
      const result = await resetPassword(token, value.password);
      if (result === "ok") {
        await navigate({
          to: "/login",
          search: { redirect: DEFAULT_REDIRECT, reset: "done" },
          replace: true,
        });
      } else {
        setFailure(result);
      }
    },
  });

  if (failure === "linkInvalid") {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-sm text-destructive">
          {t(FAILURE_MESSAGES.linkInvalid)}
        </p>
        <Link to="/forgot-password" className="text-sm font-medium underline underline-offset-2">
          {t("auth.reset.askAgain")}
        </Link>
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
      <form.Field name="password">
        {(field) => (
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <NewPasswordField
                id="reset-password"
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                error={field.state.meta.errors[0]?.message}
                readOnly={isSubmitting}
              />
            )}
          </form.Subscribe>
        )}
      </form.Field>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {t(FAILURE_MESSAGES[failure])}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
