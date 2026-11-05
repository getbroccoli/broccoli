import { CaretLeft, Users, type Icon } from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { ProfileMenu } from "./ProfileMenu";
import { useInSettings } from "./useInSettings";
import { WorkspaceMenu } from "./WorkspaceMenu";

interface NavItem {
  to: LinkProps["to"];
  label: string;
  icon?: Icon;
}

const APP_ITEMS: NavItem[] = [{ to: "/people", label: t("nav.people"), icon: Users }];
const SETTINGS_ITEMS: NavItem[] = [
  { to: "/settings/email", label: t("settings.email.title") },
  { to: "/settings/locations", label: t("settings.locations.title") },
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
          <ProfileFooter />
        </div>
        <div inert={!inSettings} className={cn(menuClass, !inSettings && "max-md:hidden")}>
          <Link
            to="/people"
            className="flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/5"
          >
            <CaretLeft size={14} weight="bold" />
            {t("nav.backToApp")}
          </Link>
          <span className="px-2 pt-3 pb-4 text-lg font-bold tracking-tight max-md:hidden">
            {t("settings.title")}
          </span>
          <span className="px-2 pb-1 text-[10.5px] font-medium tracking-wide text-foreground/40 uppercase max-md:hidden">
            {t("settings.workspace")}
          </span>
          <NavList label={t("settings.title")} items={SETTINGS_ITEMS} />
          <ProfileFooter />
        </div>
      </div>
    </aside>
  );
}

const menuClass =
  "flex items-center gap-3 px-3 py-2 md:h-full md:w-56 md:flex-col md:items-stretch md:gap-1 md:py-4";

function NavList({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <nav aria-label={label} className="flex gap-0.5 md:flex-col">
      {items.map((item) => (
        <NavLink key={item.label} item={item} />
      ))}
    </nav>
  );
}

function ProfileFooter() {
  return (
    <div className="w-44 shrink-0 md:mt-auto md:w-auto">
      <ProfileMenu />
    </div>
  );
}

function NavLink({ item: { to, label, icon: Icon } }: { item: NavItem }) {
  return (
    <Link
      to={to}
      className="flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors"
      activeProps={{ className: "bg-foreground text-background" }}
      inactiveProps={{ className: "text-foreground/80 hover:bg-foreground/5" }}
    >
      {({ isActive }) => (
        <>
          {Icon && <Icon size={16} weight={isActive ? "bold" : "regular"} />}
          <span className="flex-1 font-medium">{label}</span>
        </>
      )}
    </Link>
  );
}
