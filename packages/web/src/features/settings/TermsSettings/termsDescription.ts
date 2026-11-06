import type { RecordDescription } from "@/features/records";
import { t } from "@/i18n";

import { termsChangeSentence } from "./termsHistoryText";

/** The terms' fields as their history shows them: the name, and sentences for the week and rules. */
export const TERMS_DESCRIPTION: RecordDescription = {
  titleField: "name",
  createdAs: "records.history.setUp",
  changedAs: termsChangeSentence,
  fields: [
    {
      key: "name",
      label: t("terms.history.name"),
      editor: "text",
      format: (value) => value,
      historyOnly: true,
    },
  ],
};
