import { useApolloClient } from "@apollo/client/react";
import { ArrowRight } from "@phosphor-icons/react";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";

import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t, type MessageKey } from "@/i18n";

import { NewPasswordField } from "./NewPasswordField";
import { setUpOwner, type SetupResult } from "./setupApi";

// The API's password policy.
const PASSWORD_LENGTH = { min: 8, max: 128 };

const ownerSetupSchema = z.object({
  email: z.email(t("setup.owner.emailInvalid")),
  password: z
    .string()
    .min(PASSWORD_LENGTH.min, t("setup.owner.passwordHint"))
    .max(PASSWORD_LENGTH.max, t("setup.owner.passwordTooLong")),
});

const FAILURE_MESSAGES: Record<Exclude<SetupResult, "ok" | "ownerExists">, MessageKey> = {
  invalidInput: "setup.owner.invalidInput",
  tooManyAttempts: "setup.owner.tooManyAttempts",
  failed: "setup.owner.failed",
};

/**
 * Creates the owner account. On success the cache is cleared and the router reloads,
 * so routing sends the now signed-in owner on to the company step. When someone else
 * created the owner first, the reload sends the visitor to sign-in.
 */
export function OwnerSetupForm() {
  const apolloClient = useApolloClient();
  const router = useRouter();
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<MessageKey | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: ownerSetupSchema },
    onSubmit: async ({ value }) => {
      setFailure(null);
      const result = await setUpOwner(value.email, value.password);
      if (result === "ok") {
        await apolloClient.clearStore();
        await router.invalidate();
        return;
      }
      if (result === "ownerExists") {
        await router.invalidate();
        return;
      }
      setFailure(FAILURE_MESSAGES[result]);
      passwordInput.current?.focus();
    },
    // Focus takes a screen reader to the field and reads its error with it.
    onSubmitInvalid: ({ formApi }) => {
      const emailIsInvalid = (formApi.getFieldMeta("email")?.errors.length ?? 0) > 0;
      (emailIsInvalid ? emailInput : passwordInput).current?.focus();
    },
  });
  // The credentials stay as sent while the account is created.
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting);
  const isFilledIn = useStore(
    form.store,
    ({ values }) => values.email.trim() !== "" && values.password.length >= PASSWORD_LENGTH.min,
  );

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6 sm:p-10">
          <form.Field name="email">
            {(field) => {
              const error = field.state.meta.errors[0]?.message;
              return (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="owner-email">{t("setup.owner.email")}</Label>
                  <Input
                    ref={emailInput}
                    id="owner-email"
                    name="username"
                    type="email"
                    autoComplete="username"
                    readOnly={isSubmitting}
                    placeholder={t("setup.owner.emailPlaceholder")}
                    className="h-12 rounded-xl bg-muted/30 px-4"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={error !== undefined}
                    aria-describedby={
                      error ? "owner-email-hint owner-email-error" : "owner-email-hint"
                    }
                  />
                  <p id="owner-email-hint" className="text-sm text-muted-foreground">
                    {t("setup.owner.emailHint")}
                  </p>
                  <FieldError id="owner-email-error" message={error} />
                </div>
              );
            }}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <NewPasswordField
                id="owner-password"
                inputRef={passwordInput}
                readOnly={isSubmitting}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                error={field.state.meta.errors[0]?.message}
              />
            )}
          </form.Field>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {t(failure)}
            </p>
          )}
        </div>
      </div>
      <footer className="flex shrink-0 justify-end border-t border-border px-6 py-3 sm:px-10">
        <Button
          type="submit"
          size="lg"
          className="h-10 gap-2 px-4"
          disabled={isSubmitting || !isFilledIn}
        >
          {t(isSubmitting ? "setup.owner.submitting" : "setup.owner.submit")}
          <ArrowRight weight="bold" aria-hidden />
        </Button>
      </footer>
    </form>
  );
}
