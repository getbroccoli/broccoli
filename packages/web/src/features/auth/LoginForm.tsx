import { useApolloClient } from "@apollo/client/react";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t, type MessageKey } from "@/i18n";

import { signIn, type SignInResult } from "./auth-api";

const loginSchema = z.object({
  email: z.email(t("auth.login.emailInvalid")),
  password: z.string().min(1, t("auth.login.passwordRequired")),
});

const FAILURE_MESSAGES: Record<Exclude<SignInResult, "ok">, MessageKey> = {
  invalidCredentials: "auth.login.invalidCredentials",
  tooManyAttempts: "auth.login.tooManyAttempts",
  failed: "auth.login.failed",
};

/**
 * Email and password sign-in. On success the cache is cleared and the router reloads,
 * so the login route sends the now signed-in user on to their destination.
 */
export function LoginForm() {
  const apolloClient = useApolloClient();
  const router = useRouter();
  const passwordInput = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<MessageKey | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      setFailure(null);
      const result = await signIn(value.email, value.password);
      if (result !== "ok") {
        setFailure(FAILURE_MESSAGES[result]);
        passwordInput.current?.focus();
        return;
      }
      await apolloClient.clearStore();
      await router.invalidate();
    },
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
      <form.Field name="email">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="login-email">{t("auth.login.email")}</Label>
            <Input
              id="login-email"
              name="username"
              type="email"
              autoComplete="username"
              autoFocus
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby={
                field.state.meta.errors.length > 0 ? "login-email-error" : undefined
              }
            />
            <FieldError id="login-email-error" message={field.state.meta.errors[0]?.message} />
          </div>
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
          <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("auth.login.submitting") : t("auth.login.submit")}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) {
    return null;
  }
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}
