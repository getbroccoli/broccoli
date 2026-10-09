import { Buildings, CaretDown, Plant } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useRef } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

export function WorkspaceMenu() {
  // An item that navigates hands focus to the new page; other closes return it to the trigger.
  const navigating = useRef(false);
  const restoreFocus = () => {
    const restore = !navigating.current;
    navigating.current = false;
    return restore;
  };

  return (
    <DropdownMenu>
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
      <DropdownMenuContent align="start" className="w-60" finalFocus={restoreFocus}>
        <DropdownMenuItem
          render={<Link to="/company" />}
          onClick={() => {
            navigating.current = true;
          }}
        >
          <Buildings size={14} />
          {t("workspace.company")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
