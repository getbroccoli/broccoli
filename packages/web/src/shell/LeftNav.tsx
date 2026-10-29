import { GearSix, UserCircle, Users, type Icon } from "@phosphor-icons/react";
import { Link, useRouteContext, type LinkProps } from "@tanstack/react-router";

import { t } from "@/i18n";

import { WorkspaceMenu } from "./WorkspaceMenu";

interface NavItem {
  to: LinkProps["to"];
  params?: LinkProps["params"];
  label: string;
  icon: Icon;
}

const NAV_ITEMS: NavItem[] = [{ to: "/people", label: t("nav.people"), icon: Users }];
const ADMIN_NAV_ITEMS: NavItem[] = [{ to: "/settings", label: t("nav.settings"), icon: GearSix }];

export function LeftNav() {
  const { me } = useRouteContext({ from: "/_authenticated" });
  const items = [
    ...NAV_ITEMS,
    ...(me.employee ? [profileItem(me.employee.id)] : []),
    ...(me.operations.includes("MANAGE_WORKSPACE") ? ADMIN_NAV_ITEMS : []),
  ];
  return (
    <aside className="flex shrink-0 items-center gap-3 px-3 py-2 md:h-full md:w-56 md:flex-col md:items-stretch md:gap-1 md:py-4">
      <div className="min-w-0 flex-1 md:flex-none md:pt-1 md:pb-4">
        <WorkspaceMenu />
      </div>
      <nav aria-label={t("nav.label")} className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavLink key={item.label} item={item} />
        ))}
      </nav>
    </aside>
  );
}

/** The signed-in person's own panel. */
function profileItem(employeeId: string): NavItem {
  return {
    to: "/people/$employeeId",
    params: { employeeId },
    label: t("nav.profile"),
    icon: UserCircle,
  };
}

function NavLink({ item: { to, params, label, icon: Icon } }: { item: NavItem }) {
  return (
    <Link
      to={to}
      params={params}
      className="flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors"
      activeProps={{ className: "bg-foreground text-background" }}
      inactiveProps={{ className: "text-foreground/80 hover:bg-foreground/5" }}
    >
      {({ isActive }) => (
        <>
          <Icon size={16} weight={isActive ? "bold" : "regular"} />
          <span className="flex-1 font-medium">{label}</span>
        </>
      )}
    </Link>
  );
}
