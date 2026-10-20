import { buttonVariants } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";

import type { SignInError } from "./loginSearch";

type Props = {
  error: SignInError | undefined;
};

/**
 * Sign-in on a managed instance: the Broccoli accounts service checks who you are. Plain
 * links, so nothing starts on its own and signing out does not bounce back in.
 */
export function ManagedSignIn({ error }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(ERROR_MESSAGES[error])}
        </p>
      )}
      <a
        href={`${START}?method=google`}
        className={buttonVariants({ size: "lg", className: "w-full" })}
      >
        {t("auth.managed.google")}
      </a>
      <a
        href={`${START}?method=email`}
        className={buttonVariants({ size: "lg", variant: "outline", className: "w-full" })}
      >
        {t("auth.managed.email")}
      </a>
      <p className="text-sm text-foreground/70">{t("auth.managed.hint")}</p>
    </div>
  );
}

const START = "/api/auth/managed/start";

const ERROR_MESSAGES: Record<SignInError, MessageKey> = {
  sign_in_required: "auth.managed.signInRequired",
  sign_in_unavailable: "auth.managed.signInUnavailable",
};
