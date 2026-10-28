import { useRouteContext, useSearch } from "@tanstack/react-router";

import { t } from "@/i18n";

import { LoginForm } from "./LoginForm";
import { ManagedSignIn } from "./ManagedSignIn";

/** The login page's form: a password on self-hosted instances, the accounts service on managed ones. */
export function SignIn() {
  const { mode, ownerSignInMethod, passwordResetByEmail } = useRouteContext({ from: "/login" });
  const { error, reset } = useSearch({ from: "/login" });
  return mode === "MANAGED" ? (
    <div className="flex flex-col gap-6">
      <ManagedSignIn error={error} method={ownerSignInMethod} />
      {/* People who joined by invite sign in with the password they chose. */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("auth.managed.joinedByInvite")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <LoginForm forgotPassword={false} passwordChanged={false} />
      <p className="text-sm text-muted-foreground">{t("auth.managed.askAdmin")}</p>
    </div>
  ) : (
    <LoginForm forgotPassword={passwordResetByEmail} passwordChanged={reset === "done"} />
  );
}
