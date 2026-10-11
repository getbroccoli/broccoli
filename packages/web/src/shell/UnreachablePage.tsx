import { useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { AuthCard } from "./AuthCard";

/** Shown when the app cannot load the session, so a failure never looks like being signed out. */
export function UnreachablePage() {
  const router = useRouter();
  return (
    <AuthCard title={t("app.unreachable.title")} description={t("app.unreachable.detail")}>
      <Button variant="outline" onClick={() => void router.invalidate()}>
        {t("app.unreachable.retry")}
      </Button>
    </AuthCard>
  );
}
