import { useApolloClient } from "@apollo/client/react";
import { ArrowRight } from "@phosphor-icons/react";
import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { useRef, useState, type ReactNode } from "react";
import { z } from "zod";

import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t, type MessageKey } from "@/i18n";

import { NewPasswordField } from "./NewPasswordField";
import type { SetupResult } from "./setupApi";
import { SetupStepForm } from "./SetupStepForm";

// The API's password policy.
const PASSWORD_LENGTH = { min: 8, max: 128 };

const ownerSetupSchema = z.object({
  email: z.email(t("setup.owner.emailInvalid")),
  password: z
    .string()
    .min(PASSWORD_LENGTH.min, t("setup.owner.passwordHint"))
    .max(PASSWORD_LENGTH.max, t("setup.owner.passwordTooLong")),
});

const FAILURE_MESSAGES: Record<Exclude<SetupResult, "ok" | "conflict">, MessageKey> = {
  invalidInput: "setup.owner.invalidInput",
  tooManyAttempts: "setup.owner.tooManyAttempts",
  failed: "setup.owner.failed",
};

type Props = {
  /** Sends the credentials: the owner at the end of setup, or the demo's owner. */
  createAccount: (email: string, password: string) => Promise<SetupResult>;
  /** Shown above the fields. */
  intro?: ReactNode;
};

/**
 * Creates the owner's account. On success the cache is cleared and the router reloads,
 * so routing sends the now signed-in owner to the directory. On a conflict, such as an
 * owner created first, the reload routes the visitor to wherever setup now is.
 */
export function OwnerSetupForm({ createAccount, intro }: Props) {
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
      const result = await createAccount(value.email, value.password);
      if (result === "ok") {
        await apolloClient.clearStore();
        await router.invalidate();
        return;
      }
      if (result === "conflict") {
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
    <SetupStepForm
      onSubmit={() => void form.handleSubmit()}
      footer={
        <Button
          type="submit"
          size="lg"
          className="h-10 gap-2 px-4"
          disabled={isSubmitting || !isFilledIn}
        >
          {t(isSubmitting ? "setup.owner.submitting" : "setup.owner.submit")}
          <ArrowRight weight="bold" aria-hidden />
        </Button>
      }
    >
      {intro}
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
                aria-describedby={error ? "owner-email-hint owner-email-error" : "owner-email-hint"}
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
    </SetupStepForm>
  );
}
