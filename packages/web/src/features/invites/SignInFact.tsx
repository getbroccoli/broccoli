import { PaperPlaneTilt } from "@phosphor-icons/react";

import type { SignInStatusFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/class-names";

import { inviteAction, signInLabel, signInTone } from "./signInStatus";

const TONE_DOT = {
  none: "bg-muted-foreground/40",
  waiting: "bg-amber-500",
  problem: "bg-destructive",
  joined: "bg-brand",
} as const;

/**
 * A person's sign-in on their work email: a dot for its tone, then the state. Only a problem
 * (not sent, expired) keeps its hint; the expiry shows on hover, so the line stays short.
 */
export function SignInLine({ status }: { status: SignInStatusFragment }) {
  const now = new Date();
  const tone = signInTone(status, now);
  const { state, hint } = signInLabel(status, now);
  return (
    <span
      className="flex items-center gap-1.5 text-xs whitespace-nowrap"
      title={hint ? `${state} · ${hint}` : undefined}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_DOT[tone])} />
      {state}
      {tone === "problem" && <span className="text-destructive">{`· ${hint}`}</span>}
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
      className={cn("-my-1 -mr-1.5 shrink-0", action.prominent && "text-foreground")}
      onClick={onInvite}
    >
      <PaperPlaneTilt aria-hidden />
      {action.label}
    </Button>
  );
}
