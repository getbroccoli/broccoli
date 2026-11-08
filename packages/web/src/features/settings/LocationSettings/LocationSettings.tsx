import { useQuery } from "@apollo/client/react";
import { Link, useNavigate } from "@tanstack/react-router";

import { LocationSettingsDocument } from "@/__generated__/graphql";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { cn } from "@/lib/class-names";

import { DefaultPill } from "../TermsSettings";

/** Settings › Locations: where people work, the terms each starts new people on, and who is there. */
export function LocationSettings() {
  // Counts and order are the server's, and change from people's panels, so they reload whenever shown.
  const { data, error, refetch } = useQuery(LocationSettingsDocument, {
    fetchPolicy: "cache-and-network",
  });
  const navigate = useNavigate();

  return (
    <section aria-labelledby="location-settings-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="location-settings-title" className="text-lg font-semibold">
            {t("settings.locations.title")}
          </h2>
          <p className="max-w-[62ch] text-sm text-muted-foreground">
            {t("settings.locations.description")}
          </p>
        </div>
        {/* cn lets the outline border win over the base transparent one, as Button does. */}
        <Link to="/settings/locations/new" className={cn(buttonVariants({ variant: "outline" }))}>
          {t("settings.locations.new")}
        </Link>
      </div>
      {data ? (
        data.locations.length === 0 ? (
          <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
            {t("settings.locations.empty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[30rem] table-fixed text-sm">
              <thead className="text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                <tr className="border-b border-border">
                  <th scope="col" className="w-[40%] px-4 py-3 font-medium">
                    {t("settings.locations.column.location")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    {t("settings.locations.column.terms")}
                  </th>
                  <th scope="col" className="w-24 px-4 py-3 text-right font-medium">
                    {t("settings.locations.column.people")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.locations.map((location) => (
                  <tr
                    key={location.id}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                    onClick={(event) => {
                      // The name's link navigates itself, and leaves Ctrl-click to the browser.
                      if ((event.target as Element).closest("a")) return;
                      void navigate({
                        to: "/settings/locations/$locationId",
                        params: { locationId: location.id },
                      });
                    }}
                  >
                    <th scope="row" className="px-4 py-3 text-left font-semibold">
                      {/* The row opens the location too; the link gives keyboards and screen readers the way in. */}
                      <Link
                        to="/settings/locations/$locationId"
                        params={{ locationId: location.id }}
                        className="[overflow-wrap:anywhere] hover:underline"
                      >
                        {location.name}
                      </Link>
                    </th>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="[overflow-wrap:anywhere]">{location.terms.name}</span>
                        {location.terms.isDefault && <DefaultPill />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{location.peopleCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("settings.locations.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("settings.locations.retry")}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-[160px] rounded-xl" />
      )}
    </section>
  );
}
