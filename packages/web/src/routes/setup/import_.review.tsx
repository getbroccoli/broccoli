import { createFileRoute, redirect, stripSearchParams } from "@tanstack/react-router";

import { DEFAULT_IMPORT_REVIEW_SEARCH, ImportReview, importReviewSearch } from "@/features/imports";
import { SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** The owner reviews everyone the import found, then approves; still the server's import step. */
export const Route = createFileRoute("/setup/import_/review")({
  validateSearch: importReviewSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_IMPORT_REVIEW_SEARCH)] },
  beforeLoad: ({ context: { me, setupStep }, location }) => {
    if (!me) {
      throw redirect({ to: "/login", search: { redirect: location.href }, replace: true });
    }
    if (setupStep === "DONE") {
      throw redirect({ to: "/people", replace: true });
    }
    if (setupStep === "COMPANY") {
      throw redirect({ to: "/setup/company", replace: true });
    }
  },
  component: () => (
    <SetupLayout
      step="review"
      width="wide"
      title={t("setup.review.title")}
      description={t("setup.review.description")}
    >
      <ImportReview />
    </SetupLayout>
  ),
});
