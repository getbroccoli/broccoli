import { ArrowRight } from "@phosphor-icons/react";
import { useForm, useStore } from "@tanstack/react-form";
import { useRef, useState, type ReactNode } from "react";
import { z } from "zod";

import { FieldError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t, type MessageKey } from "@/i18n";
import { useSessionChange } from "@/lib/useSessionChange";

import { NewPasswordField } from "./NewPasswordField";
import {
  type OwnerSetupChoices,
  type OwnerSetupInvite,
  type SetupResult,
  setUpOwner,
} from "./setupApi";
import type { SetupWidth } from "./SetupLayout";
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
  /** Shown above the fields. */
  intro?: ReactNode;
  /** Shown on the left of the footer, such as a way back out of setup's last step. */
  secondaryAction?: ReactNode;
  width?: SetupWidth;
  /** Pre-fills the email, such as the work email of the person the owner said they are. */
  defaultEmail?: string;
  /** Shown below the fields, such as the invites creating the account sends. */
  children?: ReactNode;
  /** What the owner chose on "Who uses Broccoli"; none links and invites nobody. */
  choices?: OwnerSetupChoices;
  /** Runs once the account exists, with the invites it sent, before the owner enters the app. */
  onCreated?: (invites: OwnerSetupInvite[]) => Promise<void>;
  /** Runs when the account was refused for its invite note, with the note's error codes. */
  onNoteRefused?: (codes: string[]) => void;
  submitLabel?: string;
};

const NO_CHOICES: OwnerSetupChoices = {
  ownerEmployeeKey: null,
  inviteAudience: "ONLY_ADMINS",
  inviteNote: null,
};

/**
 * Creates the owner's account. On success the session changes, so routing sends the now
 * signed-in owner to the directory. On a conflict, such as an owner created first, the
 * reload routes the visitor to wherever setup now is.
 */
export function OwnerSetupForm({
  intro,
  secondaryAction,
  width,
  defaultEmail = "",
  children,
  choices = NO_CHOICES,
  onCreated,
  onNoteRefused,
  submitLabel,
}: Props) {
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [createAndReload, creating] = useSessionChange(async (email: string, password: string) => {
    setFailure(null);
    const { result, invites, fieldErrors } = await setUpOwner(email, password, choices);
    if (result === "ok") {
      await onCreated?.(invites);
      return true;
    }
    // On a conflict, setup moved on in another browser: reloading shows where.
    if (result === "conflict") {
      return true;
    }
    const noteCodes = fieldErrors.flatMap(({ field, code }) => (field === "note" ? [code] : []));
    if (noteCodes.length > 0 && onNoteRefused) {
      onNoteRefused(noteCodes);
      return false;
    }
    setFailure(FAILURE_MESSAGES[result]);
    passwordInput.current?.focus();
    return false;
  });

  const form = useForm({
    defaultValues: { email: defaultEmail, password: "" },
    validators: { onSubmit: ownerSetupSchema },
    onSubmit: ({ value }) => createAndReload(value.email, value.password),
    // Focus takes a screen reader to the field and reads its error with it.
    onSubmitInvalid: ({ formApi }) => {
      const emailIsInvalid = (formApi.getFieldMeta("email")?.errors.length ?? 0) > 0;
      (emailIsInvalid ? emailInput : passwordInput).current?.focus();
    },
  });
  // The credentials stay as sent while the account is created.
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting) || creating;
  const isFilledIn = useStore(
    form.store,
    ({ values }) => values.email.trim() !== "" && values.password.length >= PASSWORD_LENGTH.min,
  );

  return (
    <SetupStepForm
      width={width}
      onSubmit={() => void form.handleSubmit()}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          {secondaryAction}
          <Button
            type="submit"
            size="lg"
            className="ml-auto h-10 gap-2 px-4"
            disabled={isSubmitting || !isFilledIn}
          >
            {isSubmitting ? t("setup.owner.submitting") : (submitLabel ?? t("setup.owner.submit"))}
            <ArrowRight weight="bold" aria-hidden />
          </Button>
        </div>
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
      {children}
      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {t(failure)}
        </p>
      )}
    </SetupStepForm>
  );
}
