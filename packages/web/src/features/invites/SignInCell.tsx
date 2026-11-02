import type { SignInStatusFragment } from "@/__generated__/graphql";
import { cn } from "@/lib/class-names";

import { signInLabel } from "./signInStatus";

type Props = {
  status: SignInStatusFragment | null | undefined;
};

/** A person's sign-in in the People table, identifying the workspace owner. */
export function SignInCell({ status }: Props) {
  if (!status) return null;
  const { state, hint } = signInLabel(status, new Date());
  return (
    <span className="whitespace-nowrap">
      <span
        className={cn(
          !status.isWorkspaceOwner && status.state === "NOT_INVITED" && "text-muted-foreground",
        )}
      >
        {state}
      </span>
      {hint && (
        <span className={cn("text-muted-foreground", status.notSent && "text-destructive")}>
          {` · ${hint}`}
        </span>
      )}
    </span>
  );
}
