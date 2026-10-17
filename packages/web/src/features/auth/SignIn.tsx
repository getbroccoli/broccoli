import { useRouteContext, useSearch } from "@tanstack/react-router";

import { LoginForm } from "./LoginForm";
import { ManagedSignIn } from "./ManagedSignIn";

/** The login page's form: a password on self-hosted instances, the accounts service on managed ones. */
export function SignIn() {
  const { mode } = useRouteContext({ from: "/login" });
  const { error } = useSearch({ from: "/login" });
  return mode === "MANAGED" ? <ManagedSignIn error={error} /> : <LoginForm />;
}
