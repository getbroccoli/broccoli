import { PaperPlaneTilt } from "@phosphor-icons/react";

import type { SignInStatusFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/class-names";

import { SignInCell } from "./SignInCell";
import { inviteAction, signInTone } from "./signInStatus";

const TONE_DOT = {
  none: "bg-muted-foreground/40",
  waiting: "bg-amber-500",
  problem: "bg-destructive",
  joined: "bg-brand",
} as const;

/** A person's sign-in under their work email: a dot for its tone, then the state. */
export function SignInLine({ status }: { status: SignInStatusFragment }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", TONE_DOT[signInTone(status, new Date())])}
      />
      <SignInCell status={status} />
    </span>
  );
}

type InviteButtonProps = {
  status: SignInStatusFragment;
  /** Opens the invite dialog for this person. */
  onInvite: () => void;
};

/** The invite action on a person's work email; nothing for someone who cannot be invited. */
export function InviteButton({ status, onInvite }: InviteButtonProps) {
  const action = inviteAction(status, new Date());
  if (!action) return null;
  return (
    <Button
      variant={action.prominent ? "outline" : "ghost"}
      size="xs"
      className={cn("-my-1 -mr-1.5", action.prominent && "text-foreground")}
      onClick={onInvite}
    >
      <PaperPlaneTilt aria-hidden />
      {action.label}
    </Button>
  );
}
