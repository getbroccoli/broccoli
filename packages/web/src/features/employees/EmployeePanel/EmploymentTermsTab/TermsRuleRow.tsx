import { CalendarBlank, DotsThree } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { RuleSource } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { t } from "@/i18n";

type Props = {
  /** The row's name, with its icon for a time off type. */
  label: ReactNode;
  /** The row's name in words, for its menu: "Annual leave". */
  name: string;
  /** What applies today, with any detail under it; null shows `missing` instead. */
  value: { text: string; detail?: string; source: RuleSource; sourceLabel: string } | null;
  /** Shown, muted, when nothing applies today, such as "Not offered on England and Wales". */
  missing: string;
  /** Each later change, as "From 1 Jan 2027: …", with the date it starts. */
  planned: { text: string; startDate: string }[];
  /** Planned changes Cancel change can remove, by start date, and what it does. */
  onCancel?: { startDates: readonly string[]; cancel: (startDate: string) => void };
  /** The row's actions, such as Edit, in a ⋯ menu beside its source; false skips one, none hides the menu. */
  actions: readonly (RowAction | false)[];
  /** The row's editor, open in place of its value. */
  editor?: ReactNode;
  /** What a move being edited changes here, as "From 1 Dec 2026: …"; none when it changes nothing. */
  change?: string | null;
};

/** One entry of a row's ⋯ menu. */
type RowAction = { label: string; onSelect: () => void; destructive?: boolean };

/** One row of a person's employment terms: the working week or a time off type. */
export function TermsRuleRow({
  label,
  name,
  value,
  missing,
  planned,
  change,
  onCancel,
  actions,
  editor,
}: Props) {
  const menu = actions.filter((action) => action !== false);
  return (
    <li className="flex flex-col gap-1 border-b border-border/60 px-3 py-2.5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex w-44 shrink-0 items-center gap-2.5 text-sm font-medium">{label}</div>
        <div className="min-w-40 flex-1 text-sm">
          {value ? (
            <>
              <p>{value.text}</p>
              {value.detail && <p className="text-[13px] text-muted-foreground">{value.detail}</p>}
            </>
          ) : (
            <p className="text-muted-foreground">{missing}</p>
          )}
          {change && <p className="text-[13px] font-medium text-foreground">{change}</p>}
        </div>
        {value &&
          (value.source === "THEIR_OWN" ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {value.sourceLabel}
            </span>
          ) : (
            <span className="text-[13px] text-muted-foreground">{value.sourceLabel}</span>
          ))}
        {menu.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("people.panel.terms.rowActions", { name })}
                />
              }
            >
              <DotsThree weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto max-w-80">
              {menu.map((action) => (
                <DropdownMenuItem
                  key={action.label}
                  className="[overflow-wrap:anywhere]"
                  variant={action.destructive ? "destructive" : "default"}
                  onClick={action.onSelect}
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {editor}
      {planned.map(({ text, startDate }) => (
        <p key={text} className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <CalendarBlank aria-hidden className="shrink-0" />
          <span className="flex-1">{text}</span>
          {onCancel?.startDates.includes(startDate) && (
            <Button variant="ghost" size="sm" onClick={() => onCancel.cancel(startDate)}>
              {t("people.panel.terms.cancelChange")}
            </Button>
          )}
        </p>
      ))}
    </li>
  );
}
