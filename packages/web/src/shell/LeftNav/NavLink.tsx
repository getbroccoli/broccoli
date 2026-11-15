import { Link } from "@tanstack/react-router";

import type { NavItem } from "./NavList";

type Props = { item: NavItem };

/** A menu link, filled while its page is open. */
export function NavLink({ item: { to, label, icon: Icon, count, countLabel, dotLabel } }: Props) {
  return (
    <Link
      to={to}
      // Every page sits under `/`, so Today is active only on itself.
      activeOptions={{ exact: to === "/" }}
      className="flex h-8 items-center gap-2 rounded-md px-2 text-sm whitespace-nowrap transition-colors"
      activeProps={{ className: "bg-foreground text-background" }}
      inactiveProps={{ className: "text-foreground/80 hover:bg-foreground/5" }}
    >
      {({ isActive }) => (
        <>
          {Icon && <Icon size={16} weight={isActive ? "bold" : "regular"} />}
          <span className="flex-1 font-medium">{label}</span>
          {dotLabel && (
            <span
              role="img"
              aria-label={dotLabel}
              className="size-1.5 rounded-full bg-brand-light"
            />
          )}
          {Boolean(count) && (
            <span
              aria-label={countLabel}
              className="min-w-5 rounded-full bg-foreground/10 px-1.5 text-center text-[11px] font-medium tabular-nums"
            >
              {count}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
