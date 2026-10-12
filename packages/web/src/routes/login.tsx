import { createFileRoute, redirect } from "@tanstack/react-router";

import { loginSearch, SignIn } from "@/features/auth";
import { t } from "@/i18n";
import { AuthCard } from "@/shell";

export const Route = createFileRoute("/login")({
  validateSearch: loginSearch,
  beforeLoad: ({ context: { me }, search }) => {
    if (me) {
      throw redirect({ href: search.redirect, replace: true });
    }
  },
  component: () => (
    <AuthCard title={t("auth.login.title")} description={t("auth.login.description")}>
      <SignIn />
    </AuthCard>
  ),
});
