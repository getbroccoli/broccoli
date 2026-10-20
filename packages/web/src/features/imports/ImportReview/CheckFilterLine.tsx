import { Button } from "@/components/ui/button";
import { t } from "@/i18n";

import { type EmployeeFieldKey, pluralLabel } from "./employeeFields";

const INCOMPLETE = {
  firstName: "setup.review.filter.incomplete.firstName",
  lastName: "setup.review.filter.incomplete.lastName",
  email: "setup.review.filter.incomplete.email",
  other: "setup.review.filter.incomplete.other",
} as const;

/** Above a table narrowed to one check: what it shows, or "All checked" once none is left. */
export function CheckFilterLine({
  checkId,
  open,
  onShowEveryone,
}: {
  /** A check's id, such as `conflict:jobTitle`. */
  checkId: string;
  /** Whether the check still has import employees to settle. */
  open: boolean;
  onShowEveryone: () => void;
}) {
  return (
    <div className="flex items-center gap-3 text-sm" role="status">
      <span className="font-medium">
        {open ? description(checkId) : t("setup.review.filter.allChecked")}
      </span>
      <Button type="button" size="sm" variant="ghost" onClick={onShowEveryone}>
        {t("setup.review.filter.showEveryone")}
      </Button>
    </div>
  );
}

function description(checkId: string): string {
  const [kind, name] = checkId.split(":");
  if (kind === "incomplete" && name && name in INCOMPLETE) {
    return t(INCOMPLETE[name as keyof typeof INCOMPLETE]);
  }
  return t("setup.review.filter.conflict", { values: pluralLabel(name as EmployeeFieldKey) });
}
