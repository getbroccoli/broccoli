import { createFileRoute, redirect } from "@tanstack/react-router";

import { LoginForm, loginSearch, ManagedSignIn } from "@/features/auth";
import { t } from "@/i18n";
import { AuthCard } from "@/shell";

export const Route = createFileRoute("/login")({
  validateSearch: loginSearch,
  beforeLoad: ({ context: { me }, search }) => {
    if (me) {
      throw redirect({ href: search.redirect, replace: true });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const { signIn } = Route.useRouteContext();
  const { error } = Route.useSearch();
  return (
    <AuthCard title={t("auth.login.title")} description={t("auth.login.description")}>
      {signIn === "MANAGED" ? <ManagedSignIn error={error} /> : <LoginForm />}
    </AuthCard>
  );
}
