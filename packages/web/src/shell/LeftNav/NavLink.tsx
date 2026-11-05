import { Link } from "@tanstack/react-router";

import type { NavItem } from "./NavList";

type Props = { item: NavItem };

/** A menu link, filled while its page is open. */
export function NavLink({ item: { to, label, icon: Icon } }: Props) {
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
