import { createFileRoute, redirect } from "@tanstack/react-router";

import { ForgotPasswordForm } from "@/features/auth";
import { t } from "@/i18n";
import { AuthCard } from "@/shell";

export const Route = createFileRoute("/forgot-password")({
  beforeLoad: ({ context: { me, passwordResetByEmail } }) => {
    if (me || !passwordResetByEmail) {
      // Home leads a signed-out person on to sign in.
      throw redirect({ to: "/", replace: true });
    }
  },
  component: () => (
    <AuthCard title={t("auth.forgot.title")} description={t("auth.forgot.description")}>
      <ForgotPasswordForm />
    </AuthCard>
  ),
});
