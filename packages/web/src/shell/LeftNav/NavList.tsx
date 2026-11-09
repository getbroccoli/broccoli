import { type Icon } from "@phosphor-icons/react";
import { type LinkProps } from "@tanstack/react-router";

import { NavLink } from "./NavLink";

export interface NavItem {
  to: LinkProps["to"];
  label: string;
  icon?: Icon;
  /** A count beside the label, such as the tasks that need you; hidden at 0. */
  count?: number;
  /** What the count means, for screen readers. */
  countLabel?: string;
}

type Props = { label: string; items: NavItem[] };

/** A labelled list of menu links. */
export function NavList({ label, items }: Props) {
  return (
    <nav aria-label={label} className="flex gap-0.5 md:flex-col">
      {items.map((item) => (
        <NavLink key={item.label} item={item} />
      ))}
    </nav>
  );
}
