import { useQuery } from "@apollo/client/react";

import { EmailSettingsDocument } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";

import { EmailForm } from "./EmailForm";

/** The Settings page's Email section: how a self-hosted instance sends email. */
export function EmailSettings() {
  const { data, error, refetch } = useQuery(EmailSettingsDocument);

  return (
    <section aria-labelledby="email-settings-title" className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="email-settings-title" className="text-lg font-semibold">
          {t("settings.email.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("settings.email.description")}</p>
      </div>
      {data ? (
        data.setup.mail ? (
          <EmailForm mail={data.setup.mail} />
        ) : (
          <p className="text-sm">{t("settings.email.managed")}</p>
        )
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-sm text-destructive">{t("settings.email.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("settings.email.retry")}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-[240px] rounded-xl" />
      )}
    </section>
  );
}
