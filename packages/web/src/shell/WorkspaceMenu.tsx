import { useQuery } from "@apollo/client/react";
import { ArrowCounterClockwise, CaretDown, GearSix, Plant } from "@phosphor-icons/react";
import { Link, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";

import { WorkspaceMenuDocument } from "@/__generated__/graphql";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExitDemoDialog, useDemoPresent } from "@/features/demo";
import { ResetSetupDialog } from "@/features/setup";
import { t } from "@/i18n";

import { useMenuFinalFocus } from "./useMenuFinalFocus";

/** The company menu: the company's name and logo, and the actions on the whole workspace. */
export function WorkspaceMenu() {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const demoPresent = useDemoPresent();
  const company = useQuery(WorkspaceMenuDocument).data?.company;
  const { onOpenChange, finalFocus } = useMenuFinalFocus();
  // Outside the menu, which closes when an item is chosen.
  const [exitingDemo, setExitingDemo] = useState(false);
  const [resettingSetup, setResettingSetup] = useState(false);
  const name = company?.name ?? t("workspace.name");
  const canManage = me.operations.includes("MANAGE_WORKSPACE");
  const canReset = me.operations.includes("RESET_WORKSPACE");

  return (
    <>
      <DropdownMenu onOpenChange={onOpenChange}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="group/workspace flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-foreground/5 aria-expanded:bg-foreground/5"
            >
              <CompanyLogo url={company?.logoUrl} />
              <span
                title={name}
                className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight"
              >
                {name}
              </span>
              <CaretDown
                size={11}
                weight="bold"
                className="text-muted-foreground transition-transform group-aria-expanded/workspace:rotate-180"
              />
            </button>
          }
        />
        <DropdownMenuContent align="start" className="w-60" finalFocus={finalFocus}>
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center gap-2 px-2 py-2">
              <CompanyLogo url={company?.logoUrl} />
              <span className="truncate text-[13px] font-semibold text-foreground">{name}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          {(canManage || canReset) && <DropdownMenuSeparator />}
          {canManage && (
            <DropdownMenuItem render={<Link to="/settings" />}>
              <GearSix size={14} />
              {t("settings.title")}
            </DropdownMenuItem>
          )}
          {/* The demo's owner exits the demo instead. */}
          {demoPresent === false && canReset && (
            <DropdownMenuItem variant="destructive" onClick={() => setResettingSetup(true)}>
              <ArrowCounterClockwise size={14} />
              {t("setup.reset.open")}
            </DropdownMenuItem>
          )}
          {demoPresent && canReset && (
            <DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{t("demo.menu.label")}</DropdownMenuLabel>
              <DropdownMenuItem variant="destructive" onClick={() => setExitingDemo(true)}>
                <ArrowCounterClockwise size={14} />
                {t("demo.exit.open")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ExitDemoDialog open={exitingDemo} onOpenChange={setExitingDemo} />
      <ResetSetupDialog open={resettingSetup} onOpenChange={setResettingSetup} />
    </>
  );
}

function CompanyLogo({ url }: { url: string | null | undefined }) {
  return url ? (
    <img src={url} alt="" className="size-7 shrink-0 rounded-md bg-card object-contain" />
  ) : (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground">
      <Plant size={16} weight="fill" aria-hidden />
    </span>
  );
}
