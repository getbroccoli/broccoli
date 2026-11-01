import { useState } from "react";

import { t } from "@/i18n";

type Props = {
  people: string[];
};

/** The names of the people an option or the last page invites, folded until asked for. */
export function PeopleNames({ people }: Props) {
  // Thousands of names render only once asked for.
  const [open, setOpen] = useState(false);
  if (people.length === 0) {
    return null;
  }
  return (
    <details className="text-sm" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-muted-foreground">{t("setup.who.showNames")}</summary>
      {open && (
        <ul className="subtle-scrollbar mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
          {people.map((name, index) => (
            <li key={index}>{name}</li>
          ))}
        </ul>
      )}
    </details>
  );
}
