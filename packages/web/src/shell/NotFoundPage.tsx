import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { PageHeader } from "./PageHeader";

export function NotFoundPage() {
  return (
    <>
      <PageHeader title={t("notFound.title")} description={t("notFound.description")} />
      <Button render={<Link to="/people" />}>{t("notFound.back")}</Button>
    </>
  );
}
