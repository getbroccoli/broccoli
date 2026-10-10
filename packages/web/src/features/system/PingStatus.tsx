import { useQuery } from "@apollo/client/react";

import { PingDocument } from "@/generated/graphql";
import { t } from "@/i18n";

/** Temporary debug check of the API connection; remove once the People page lists people. */
export function PingStatus() {
  const { data, error } = useQuery(PingDocument);
  if (error) return <p className="text-sm text-muted-foreground">{t("system.ping.unreachable")}</p>;
  if (!data) return null;
  return <p className="text-sm text-muted-foreground">{t("system.ping.ok")}</p>;
}
