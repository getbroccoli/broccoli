import { CaretLeft, Users } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { ProfileMenu } from "../ProfileMenu";
import { useInSettings } from "../useInSettings";
import { WorkspaceMenu } from "../WorkspaceMenu";
import { NavList, type NavItem } from "./NavList";

const APP_ITEMS: NavItem[] = [{ to: "/people", label: t("nav.people"), icon: Users }];
const SETTINGS_ITEMS: NavItem[] = [
  { to: "/settings/email", label: t("settings.email.title") },
  { to: "/settings/locations", label: t("settings.locations.title") },
];
const SETTINGS_AREA_ITEMS: NavItem[] = [
  { to: "/settings/time-off", label: t("settings.timeOff.title") },
];

/**
 * The app menu, or the Settings menu while a settings page is open. On wide screens both
 * sit side by side in one strip that slides between them.
 */
export function LeftNav() {
  const inSettings = useInSettings();
  return (
    <aside className="shrink-0 md:h-full md:w-56 md:overflow-hidden">
      <div
        className={cn(
          "md:flex md:h-full md:w-112 md:transition-transform md:duration-500 md:ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none",
          inSettings && "md:-translate-x-1/2",
        )}
      >
        {/* `inert` keeps Tab and screen readers out of the menu slid off screen. */}
        <div inert={inSettings} className={cn(menuClass, inSettings && "max-md:hidden")}>
          <div className="min-w-0 flex-1 md:flex-none md:pt-1 md:pb-4">
            <WorkspaceMenu />
          </div>
          <NavList label={t("nav.label")} items={APP_ITEMS} />
          <ProfileMenu />
        </div>
        <div inert={!inSettings} className={cn(menuClass, !inSettings && "max-md:hidden")}>
          <Link
            to="/people"
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium whitespace-nowrap text-foreground/80 transition-colors hover:bg-foreground/5"
          >
            <CaretLeft size={14} weight="bold" />
            {t("nav.backToApp")}
          </Link>
          <span className="px-2 pt-3 pb-4 text-lg font-bold tracking-tight max-md:hidden">
            {t("settings.title")}
          </span>
          <span className={groupLabelClass}>{t("settings.workspace")}</span>
          <NavList label={t("settings.title")} items={SETTINGS_ITEMS} />
          <span className={cn(groupLabelClass, "md:pt-4")}>{t("settings.areas")}</span>
          <NavList label={t("settings.areas")} items={SETTINGS_AREA_ITEMS} />
          <ProfileMenu />
        </div>
      </div>
    </aside>
  );
}

const menuClass =
  "flex items-center gap-3 px-3 py-2 max-md:overflow-x-auto md:h-full md:w-56 md:flex-col md:items-stretch md:gap-1 md:py-4";

const groupLabelClass =
  "px-2 pb-1 text-[10.5px] font-medium tracking-wide text-foreground/40 uppercase max-md:hidden";
