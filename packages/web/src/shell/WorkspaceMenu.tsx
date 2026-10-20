import { useApolloClient } from "@apollo/client/react";
import {
  ArrowCounterClockwise,
  Buildings,
  CaretDown,
  Plant,
  SignOut,
  UserPlus,
} from "@phosphor-icons/react";
import { Link, useRouteContext, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";

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
import { ResetDemoDialog } from "@/features/demo";
import { t } from "@/i18n";

export function WorkspaceMenu() {
  const router = useRouter();
  const apolloClient = useApolloClient();
  const { me, demoExpiresAt } = useRouteContext({ from: "/_authenticated" });
  const openedOnPath = useRef<string | null>(null);
  // Outside the menu, which closes when an item is chosen.
  const [resettingDemo, setResettingDemo] = useState(false);
  // Return focus to the trigger unless the page changed, in which case the new page's
  // heading takes it (see `useFocusHeadingOnNavigation`).
  const isStillOnOpeningPage = () => router.state.location.pathname === openedOnPath.current;

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) {
            openedOnPath.current = router.state.location.pathname;
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="group/workspace flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-foreground/5 aria-expanded:bg-foreground/5"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground">
                <Plant size={16} weight="fill" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
                {t("workspace.name")}
              </span>
              <CaretDown
                size={11}
                weight="bold"
                className="text-muted-foreground transition-transform group-aria-expanded/workspace:rotate-180"
              />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-60" finalFocus={isStillOnOpeningPage}>
          <DropdownMenuItem render={<Link to="/company" />}>
            <Buildings size={14} />
            {t("workspace.company")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {demoExpiresAt ? (
            // The demo's owner has no password, so signing out would lock them out.
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("demo.menu.label")}</DropdownMenuLabel>
              <DropdownMenuItem render={<Link to="/account" />}>
                <UserPlus size={14} />
                {t("demo.banner.createAccount")}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => setResettingDemo(true)}>
                <ArrowCounterClockwise size={14} />
                {t("demo.menu.reset")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate">
                {t("auth.signedInAs", { email: me.email })}
              </DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void signOutAndReload()}>
                <SignOut size={14} />
                {t("auth.signOut")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ResetDemoDialog open={resettingDemo} onOpenChange={setResettingDemo} />
    </>
  );

  /** The gate then sends the signed-out user to the login page. */
  async function signOutAndReload() {
    if (await signOut()) {
      await apolloClient.clearStore();
      await router.invalidate();
    }
  }
}
