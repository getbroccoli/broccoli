import { Users, type Icon } from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";

import { t } from "@/i18n";

import { WorkspaceMenu } from "./WorkspaceMenu";

interface NavItem {
  to: LinkProps["to"];
  label: string;
  icon: Icon;
}

const NAV_ITEMS: NavItem[] = [{ to: "/people", label: t("nav.people"), icon: Users }];

export function LeftNav() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col gap-1 px-3 py-4">
      <div className="pt-1 pb-4">
        <WorkspaceMenu />
      </div>
      <nav aria-label={t("nav.label")} className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} item={item} />
        ))}
      </nav>
    </aside>
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
          <Icon size={16} weight={isActive ? "bold" : "regular"} />
          <span className="flex-1 font-medium">{label}</span>
        </>
      )}
    </Link>
  );
}
