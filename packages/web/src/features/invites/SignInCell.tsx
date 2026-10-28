import type { SignInStatusFragment } from "@/__generated__/graphql";
import { cn } from "@/lib/class-names";

import { signInLabel } from "./signInStatus";

/** A person's sign-in in the People table: Not invited, Pending with its expiry, or Joined. */
export function SignInCell({ status }: { status: SignInStatusFragment | null | undefined }) {
  if (!status) return null;
  const { state, hint } = signInLabel(status, new Date());
  return (
    <span className="whitespace-nowrap">
      <span className={cn(status.state === "NOT_INVITED" && "text-muted-foreground")}>{state}</span>
      {hint && (
        <span className={cn("text-muted-foreground", status.notSent && "text-destructive")}>
          {` · ${hint}`}
        </span>
      )}
    </span>
  );
}
