import { useBlocker } from "@tanstack/react-router";
import { DotsThree, X } from "@phosphor-icons/react";
import { useRef, useState } from "react";

import type { EmployeePanel_EmployeeFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetClose, SheetTitle } from "@/components/ui/sheet";
import { RecordHistory } from "@/features/records";
import { t } from "@/i18n";

import { Avatar } from "../Avatar";
import { DiscardChangesDialog } from "./DiscardChangesDialog";
import { EditableField } from "./EditableField";
import { EditBar } from "./EditBar";
import { EMPLOYEE_DESCRIPTION } from "./employeeDescription";
import type { EmployeeFieldKey } from "./employeeDraft";
import { KeyFacts } from "./KeyFacts";
import { RemoveEmployeeDialog } from "./RemoveEmployeeDialog";
import { useEmployeeDraft } from "./useEmployeeDraft";

type Props = {
  employee: EmployeePanel_EmployeeFragment;
  onClose: () => void;
};

/**
 * One loaded person in their panel: header, key facts, fields edited in place with one Save,
 * and their history. Leaving with unsaved changes asks first.
 */
export function EmployeeRecord({ employee, onClose }: Props) {
  const draft = useEmployeeDraft(employee);
  const [removing, setRemoving] = useState(false);
  // Set once the employee is removed, so closing their panel asks nothing.
  const removed = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => !removed.current && draft.changed.length > 0,
    enableBeforeUnload: () => !removed.current && draft.changed.length > 0,
    withResolver: true,
  });
  const fullName = `${employee.firstName} ${employee.lastName}`;
  const sections = Map.groupBy(EMPLOYEE_DESCRIPTION.fields, (field) => field.section);
  // In panel order, as the person reads the fields.
  const changedLabels = EMPLOYEE_DESCRIPTION.fields
    .filter((field) => draft.changed.includes(field.key as EmployeeFieldKey))
    .map((field) => field.label);

  return (
    <>
      <header className="flex items-center gap-4 border-b border-border px-6 py-5">
        <Avatar
          url={employee.avatarUrl ?? null}
          firstName={employee.firstName}
          lastName={employee.lastName}
          className="size-14 text-lg"
        />
        <div className="min-w-0 flex-1">
          <SheetTitle className="truncate">{fullName}</SheetTitle>
          {employee.jobTitle && (
            <p className="truncate text-sm text-muted-foreground">{employee.jobTitle}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label={t("people.panel.more")} />}
          >
            <DotsThree weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => setRemoving(true)}>
              {t("people.panel.remove.menu", { name: fullName })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <SheetClose
          render={<Button variant="ghost" size="icon" aria-label={t("people.panel.close")} />}
        >
          <X />
        </SheetClose>
      </header>

      <div className="subtle-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
        <KeyFacts startDate={employee.startDate ?? null} email={employee.email} />

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
                      saved={draft.saved[key]}
                      draft={draft.draft[key]}
                      error={draft.fieldErrors[key]}
                      disabled={draft.saving}
                      onEdit={(value) => draft.edit(key, value)}
                      onRevert={() => draft.revert(key)}
                    />
                  );
                })}
              </section>
            ))}
          </div>
        </section>

        <RecordHistory
          recordType="EMPLOYEE"
          recordId={employee.id}
          description={EMPLOYEE_DESCRIPTION}
        />
      </div>

      {draft.changed.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <EditBar
            changedLabels={changedLabels}
            reason={draft.reason}
            onReasonChange={draft.setReason}
            saving={draft.saving}
            failure={draft.failure}
            onCancel={draft.cancel}
            onSave={() => void draft.save()}
          />
        </div>
      )}

      <DiscardChangesDialog
        open={blocker.status === "blocked"}
        count={draft.changed.length}
        name={fullName}
        onDiscard={() => blocker.proceed?.()}
        onKeepEditing={() => blocker.reset?.()}
      />
      <RemoveEmployeeDialog
        open={removing}
        onOpenChange={setRemoving}
        employee={employee}
        onRemoved={() => {
          removed.current = true;
          onClose();
        }}
      />
    </>
  );
}
