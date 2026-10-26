import { createFileRoute } from "@tanstack/react-router";

import { ResetPasswordForm } from "@/features/auth";
import { t } from "@/i18n";
import { AuthCard } from "@/shell";

/** Opened from a reset email: `/reset-password#<token>`. */
export const Route = createFileRoute("/reset-password")({
  component: () => (
    <AuthCard title={t("auth.reset.title")} description={t("auth.reset.description")}>
      <ResetPasswordForm />
    </AuthCard>
  ),
});
