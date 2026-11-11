import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import type { ChangeBox } from "./termsDraft";

type Props = {
  /** Each new value and from when. */
  changes: ChangeBox[];
  /** The people publishing reaches, by name; null while they load. */
  people: { id: string; firstName: string; lastName: string }[] | null;
};

/** In the Publish dialog: what publishing changes, and the people it reaches. */
export function WhatChanges({ changes, people }: Props) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? people : people?.slice(0, FIRST_PEOPLE);
  return (
    <section aria-labelledby="terms-what-changes" className="flex flex-col gap-3">
      <h3 id="terms-what-changes" className="text-xs font-semibold text-muted-foreground uppercase">
        {t("terms.edit.whatChanges")}
      </h3>
      {changes.map((box) => (
        <div key={box.title} className="rounded-xl border border-border bg-background p-3">
          <p className="font-semibold">{box.title}</p>
          <p className="text-[13px] text-muted-foreground">{box.detail}</p>
        </div>
      ))}
      {people === null ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <p className="text-sm font-semibold">
            {people.length === 1
              ? t("terms.publish.reachOne")
              : t("terms.publish.reach", { count: String(people.length) })}
          </p>
          <ul className="flex flex-col gap-1.5">
            {shown?.map(({ id, firstName, lastName }) => (
              <li key={id} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className="grid size-6 place-items-center rounded-full bg-muted text-[11px] font-semibold"
                >
                  {`${firstName.charAt(0)}${lastName.charAt(0)}`}
                </span>
                {`${firstName} ${lastName}`}
              </li>
            ))}
          </ul>
          {!showAll && people.length > FIRST_PEOPLE && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start px-0"
              onClick={() => setShowAll(true)}
            >
              {t("terms.edit.showAll", { count: String(people.length) })}
            </Button>
          )}
        </>
      )}
      <p className="text-[13px] text-muted-foreground">{t("terms.edit.soon")}</p>
    </section>
  );
}

const FIRST_PEOPLE = 5;
