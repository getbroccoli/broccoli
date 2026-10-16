import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import { DEFAULT_EMPLOYEE_LIST_SEARCH } from "@/features/employees";
import { ImportReview, importReviewSearch } from "@/features/imports";
import { requireSetupStep, SetupLayout } from "@/features/setup";
import { t } from "@/i18n";

/** The owner reviews everyone the import found, then approves; still the server's import step. */
export const Route = createFileRoute("/setup/import_/review")({
  validateSearch: importReviewSearch,
  search: { middlewares: [stripSearchParams(DEFAULT_EMPLOYEE_LIST_SEARCH)] },
  beforeLoad: (gate) => {
    requireSetupStep("IMPORT", gate);
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
