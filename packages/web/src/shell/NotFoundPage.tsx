import { Link } from "@tanstack/react-router";

import { buttonVariants } from "@/components/ui/button";
import { t } from "@/i18n";

import { AuthCard } from "./AuthCard";

export function NotFoundPage() {
  return (
    <AuthCard title={t("notFound.title")} description={t("notFound.description")}>
      <Link to="/people" className={buttonVariants()}>
        {t("notFound.back")}
      </Link>
    </AuthCard>
  );
}
