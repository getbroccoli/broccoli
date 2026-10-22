import type { OwnerSignInMethod } from "@/__generated__/graphql";
import { buttonVariants } from "@/components/ui/button";
import { t, type MessageKey } from "@/i18n";

import type { SignInError } from "./loginSearch";

type Props = {
  error: SignInError | undefined;
  /** The owner's way in; null offers both until the instance learns it. */
  method: OwnerSignInMethod | null;
};

/**
 * Sign-in on a managed instance: the Broccoli accounts service checks who you are. Plain
 * links, so nothing starts on its own and signing out does not bounce back in.
 */
export function ManagedSignIn({ error, method }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(ERROR_MESSAGES[error])}
        </p>
      )}
      {method ? (
        <a
          href={START_LINKS[method]}
          className={buttonVariants({ size: "lg", className: "w-full" })}
        >
          {t(BUTTON_LABELS[method])}
        </a>
      ) : (
        <>
          <a
            href={START_LINKS.SIGN_IN_WITH_GOOGLE}
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            {t("auth.managed.google")}
          </a>
          <a
            href={START_LINKS.SIGN_IN_WITH_EMAIL}
            className={buttonVariants({ size: "lg", variant: "outline", className: "w-full" })}
          >
            {t("auth.managed.email")}
          </a>
          <p className="text-sm text-foreground/70">{t("auth.managed.hint")}</p>
        </>
      )}
    </div>
  );
}

const START = "/api/auth/managed/start";

const START_LINKS: Record<OwnerSignInMethod, string> = {
  SIGN_IN_WITH_GOOGLE: `${START}?method=google`,
  SIGN_IN_WITH_EMAIL: `${START}?method=email`,
};

const BUTTON_LABELS: Record<OwnerSignInMethod, MessageKey> = {
  SIGN_IN_WITH_GOOGLE: "auth.managed.google",
  SIGN_IN_WITH_EMAIL: "auth.managed.email",
};

const ERROR_MESSAGES: Record<SignInError, MessageKey> = {
  sign_in_required: "auth.managed.signInRequired",
  sign_in_unavailable: "auth.managed.signInUnavailable",
};
