import { CaretUp, SignOut, User } from "@phosphor-icons/react";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/features/auth";
import { Avatar } from "@/features/employees";
import { t } from "@/i18n";
import { useSessionChange } from "@/lib/useSessionChange";

import { useMenuFinalFocus } from "./useMenuFinalFocus";

/** The signed-in user's button and menu at the bottom of the left menu: their profile and signing out. */
export function ProfileMenu() {
  const { me, demoExpiresAt } = useRouteContext({ from: "/_authenticated" });
  const { onOpenChange, finalFocus } = useMenuFinalFocus();
  const [signOutFailed, setSignOutFailed] = useState(false);
  // The gate then sends the signed-out user to the login page.
  const [signOutAndReload, signingOut] = useSessionChange(async () => {
    setSignOutFailed(false);
    const signedOut = await signOut();
    setSignOutFailed(!signedOut);
    return signedOut;
  });
  // A user without a person record, such as the owner, goes by their email.
  const person = me.employee ?? {
    firstName: me.email,
    lastName: "",
    jobTitle: null,
    avatarUrl: null,
  };
  const name = `${person.firstName} ${person.lastName}`.trim();
  const avatar = (
    <Avatar url={person.avatarUrl} firstName={person.firstName} lastName={person.lastName} />
  );

  return (
    <div className="shrink-0 md:mt-auto">
      {signOutFailed && (
        <p role="alert" className="px-2 text-sm text-destructive">
          {t("auth.signOutFailed")}
        </p>
      )}
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="group/profile flex w-full items-center gap-2 rounded-md px-1 py-2 text-left transition-colors hover:bg-foreground/5 aria-expanded:bg-foreground/5"
            >
              {avatar}
              {/* Narrow screens show the avatar only. */}
              <span className="flex min-w-0 flex-1 flex-col max-md:sr-only">
                <span className="truncate text-xs font-medium">{name}</span>
                {person.jobTitle && (
                  <span className="truncate text-[11px] text-muted-foreground">
                    {person.jobTitle}
                  </span>
                )}
              </span>
              <CaretUp
                size={11}
                weight="bold"
                className="text-muted-foreground transition-transform group-aria-expanded/profile:rotate-180 max-md:hidden"
              />
            </button>
          }
        />
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={8}
          className="w-60"
          finalFocus={finalFocus}
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2 px-2 py-2">
              {avatar}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-semibold text-foreground">{name}</span>
                {me.employee && (
                  <span className="truncate text-[11px] text-muted-foreground">{me.email}</span>
                )}
              </span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/me" />}>
            <User size={14} />
            {t("nav.myProfile")}
          </DropdownMenuItem>
          {/* The demo's provisional owner has no password, so signing out would lock them out. */}
          {!demoExpiresAt && (
            <DropdownMenuItem disabled={signingOut} onClick={() => signOutAndReload()}>
              <SignOut size={14} />
              {t("auth.signOut")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
