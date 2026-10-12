import { Button } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";

import type { SignInError } from "./loginSearch";

const START = "/api/auth/managed/start";

const ERROR_MESSAGES: Record<SignInError, MessageKey> = {
  sign_in_required: "auth.managed.signInRequired",
  sign_in_unavailable: "auth.managed.signInUnavailable",
};

/**
 * Sign-in on a managed instance: the Broccoli accounts service checks who you are. Plain
 * links, so nothing starts on its own and signing out does not bounce back in.
 */
export function ManagedSignIn({ error }: { error: SignInError | undefined }) {
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(ERROR_MESSAGES[error])}
        </p>
      )}
      <Button size="lg" className="w-full" render={<a href={`${START}?method=google`} />}>
        {t("auth.managed.google")}
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="w-full"
        render={<a href={`${START}?method=email`} />}
      >
        {t("auth.managed.email")}
      </Button>
      <p className="text-sm text-foreground/70">{t("auth.managed.hint")}</p>
    </div>
  );
}
