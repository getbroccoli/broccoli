import type { EmployeePanel_EmployeeFragment } from "@/__generated__/graphql";
import { useCache } from "@/apollo";
import { EditableField } from "@/features/records";
import { t } from "@/i18n";

import { cachedEmployeeName, cachedLocationName } from "../cache";
import { EMPLOYEE_DESCRIPTION } from "./employeeDescription";
import type { EmployeeFieldKey } from "./employeeDraft";
import type { useEmployeeDraft } from "./useEmployeeDraft";

type Props = {
  employee: EmployeePanel_EmployeeFragment;
  draft: ReturnType<typeof useEmployeeDraft>;
  canEdit: (key: EmployeeFieldKey) => boolean;
};

/** The person's fields in their sections, each edited in place. */
export function EmployeeDetails({ employee, draft, canEdit }: Props) {
  const cache = useCache();
  // The draft holds the manager's id; the panel shows their name.
  // Permissions show only for someone who signs in.
  const fields = EMPLOYEE_DESCRIPTION.fields
    .filter((field) => !("historyOnly" in field))
    .filter((field) => field.key !== "permissionProfiles" || employee.permissionProfiles)
    .map((field) =>
      field.key === "manager"
        ? { ...field, format: (id: string) => cachedEmployeeName(cache, id) ?? id }
        : field.key === "location"
          ? { ...field, format: (id: string) => cachedLocationName(cache, id) ?? id }
          : field,
    );
  const sections = Map.groupBy(fields, (field) => field.section);

  return (
    <section aria-labelledby="employee-details" className="flex flex-col gap-2">
      <h2
        id="employee-details"
        className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
      >
        {t("people.panel.section.details")}
      </h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] items-start gap-4">
        {[...sections].map(([section, fields]) => (
          <section
            key={section}
            aria-label={section}
            className="overflow-hidden rounded-xl border border-border"
          >
            <h3 className="border-b border-border/60 bg-sidebar px-3 py-2 text-[13px] font-medium">
              {section}
            </h3>
            {fields.map((field) => {
              const key = field.key as EmployeeFieldKey;
              return (
                <EditableField
                  key={key}
                  field={field}
                  recordId={employee.id}
                  saved={draft.saved[key]}
                  draft={draft.draft[key]}
                  error={draft.fieldErrors[key]}
                  disabled={draft.saving}
                  readOnly={!canEdit(key)}
                  onEdit={(value) => draft.edit(key, value)}
                  onRevert={() => draft.revert(key)}
                />
              );
            })}
          </section>
        ))}
      </div>
    </section>
  );
}
