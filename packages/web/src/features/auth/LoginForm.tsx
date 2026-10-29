import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";

import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t, type MessageKey } from "@/i18n";
import { useSessionChange } from "@/lib/useSessionChange";

import { EmailField } from "./EmailField";
import { signIn, type SignInResult } from "./authApi";

const loginSchema = z.object({
  email: z.email(t("auth.login.emailInvalid")),
  password: z.string().min(1, t("auth.login.passwordRequired")),
});

const FAILURE_MESSAGES: Record<Exclude<SignInResult, "ok">, MessageKey> = {
  invalidCredentials: "auth.login.invalidCredentials",
  tooManyAttempts: "auth.login.tooManyAttempts",
  failed: "auth.login.failed",
};

type Props = {
  /** Offers "Forgot password?", while the instance can email a reset link. */
  forgotPassword: boolean;
  /** Says the new password works, after a reset. */
  passwordChanged: boolean;
};

/**
 * Email and password sign-in. On success the session changes, so the login route sends
 * the now signed-in user on to their destination.
 */
export function LoginForm({ forgotPassword, passwordChanged }: Props) {
  const passwordInput = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [signInAndReload, signingIn] = useSessionChange(async (email: string, password: string) => {
    setFailure(null);
    const result = await signIn(email, password);
    if (result !== "ok") {
      setFailure(FAILURE_MESSAGES[result]);
      passwordInput.current?.focus();
    }
    return result === "ok";
  });

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: loginSchema },
    onSubmit: ({ value }) => signInAndReload(value.email, value.password),
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      aria-describedby={passwordChanged ? "login-password-changed" : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {passwordChanged && (
        <p id="login-password-changed" role="status" className="text-sm text-brand-deep">
          {t("auth.login.passwordChanged")}
        </p>
      )}
      <form.Field name="email">
        {(field) => (
          <EmailField
            id="login-email"
            value={field.state.value}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
            error={field.state.meta.errors[0]?.message}
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-password">{t("auth.login.password")}</Label>
            <Input
              ref={passwordInput}
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby={
                field.state.meta.errors.length > 0 ? "login-password-error" : undefined
              }
            />
            <FieldError id="login-password-error" message={field.state.meta.errors[0]?.message} />
          </div>
        )}
      </form.Field>
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {t(failure)}
        </p>
      )}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting || signingIn}>
            {isSubmitting || signingIn ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        )}
      </form.Subscribe>
      {forgotPassword && (
        <Link
          to="/forgot-password"
          className="self-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {t("auth.login.forgotPassword")}
        </Link>
      )}
    </form>
  );
}
