import { useBlocker, useNavigate, useRouteContext, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import type { EmployeePanel_EmployeeFragment } from "@/__generated__/graphql";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { type CopiedLink, CopiedLinkDialog, InviteDialog } from "@/features/invites";
import { EditBar, FieldValue } from "@/features/records";
import { t } from "@/i18n";

import { DiscardChangesDialog } from "./DiscardChangesDialog";
import { EmployeeDetails } from "./EmployeeDetails";
import { EmployeeHeader } from "./EmployeeHeader";
import { EmployeeHistory } from "./EmployeeHistory";
import { EmploymentTermsTab } from "./EmploymentTermsTab";
import { EMPLOYEE_DESCRIPTION } from "./employeeDescription";
import { type EmployeeFieldKey, INPUT_KEYS } from "./employeeDraft";
import { KeyFacts } from "./KeyFacts";
import { TimeOffSection } from "./TimeOffSection";
import { RemoveEmployeeDialog } from "./RemoveEmployeeDialog";
import { useEmployeeDraft } from "./useEmployeeDraft";

type Props = {
  employee: EmployeePanel_EmployeeFragment;
  onClose: () => void;
};

/**
 * One loaded person in their panel: header, then tabs for an overview of key facts, time off and
 * fields edited in place with one Save, and their history. Leaving with unsaved changes asks first.
 */
export function EmployeeRecord({ employee, onClose }: Props) {
  const draft = useEmployeeDraft(employee);
  const [removing, setRemoving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [copiedLink, setCopiedLink] = useState<CopiedLink | null>(null);
  // Set once the employee is removed, so closing their panel asks nothing.
  const removed = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => !removed.current && draft.changed.length > 0,
    enableBeforeUnload: () => !removed.current && draft.changed.length > 0,
    withResolver: true,
  });
  // A save can finish while navigation is already waiting for the discard decision.
  useEffect(() => {
    if (blocker.status === "blocked" && draft.changed.length === 0) blocker.proceed();
  }, [blocker, draft.changed.length]);
  const fullName = `${employee.firstName} ${employee.lastName}`;
  const { tab } = useSearch({ from: "/_authenticated/people/$employeeId" });
  const navigate = useNavigate({ from: "/people/$employeeId" });
  const { me } = useRouteContext({ from: "/_authenticated" });
  const { operations } = me;
  const editable = new Set(employee.access.editableFields);
  const canEdit = (key: EmployeeFieldKey) =>
    key === "permissionProfiles"
      ? operations.includes("MANAGE_WORKSPACE") && !employee.permissionProfiles?.includes("OWNER")
      : editable.has(INPUT_KEYS[key as keyof typeof INPUT_KEYS] ?? key);
  // In panel order, as the person reads the fields.
  const changedLabels = EMPLOYEE_DESCRIPTION.fields
    .filter((field) => draft.changed.includes(field.key as EmployeeFieldKey))
    .map((field) => field.label);

  return (
    <>
      <EmployeeHeader
        employee={employee}
        onInvite={() => setInviting(true)}
        onLinkCreated={setCopiedLink}
        onRemove={() => setRemoving(true)}
      />

      <Tabs
        value={tab}
        onValueChange={(value: typeof tab) =>
          void navigate({ search: (previous) => ({ ...previous, tab: value }) })
        }
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList aria-label={t("people.panel.tabs", { name: fullName })} className="px-6 pt-1">
          <TabsTab value="overview" className="pt-2">
            {t("people.panel.tab.overview")}
          </TabsTab>
          {employee.employmentTerms && (
            <TabsTab value="terms" className="pt-2">
              {t("people.panel.tab.terms")}
            </TabsTab>
          )}
          <TabsTab value="history" className="pt-2">
            {t("people.panel.tab.history")}
          </TabsTab>
        </TabsList>
        <TabsPanel
          value="overview"
          className="subtle-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6"
        >
          <KeyFacts
            startDate={employee.startDate ?? null}
            email={
              <FieldValue
                field={EMAIL_FIELD}
                recordId={employee.id}
                saved={draft.saved.email}
                draft={draft.draft.email}
                error={draft.fieldErrors.email}
                disabled={draft.saving}
                readOnly={!canEdit("email")}
                onEdit={(value) => draft.edit("email", value)}
                onRevert={() => draft.revert("email")}
              />
            }
            emailMark={
              draft.fieldErrors.email
                ? "invalid"
                : draft.changed.includes("email")
                  ? "changed"
                  : null
            }
            signIn={
              employee.signInStatus
                ? { status: employee.signInStatus, onInvite: () => setInviting(true) }
                : null
            }
          />

          {employee.timeOffTypes && <TimeOffSection timeOffTypes={employee.timeOffTypes} />}

          <EmployeeDetails employee={employee} draft={draft} canEdit={canEdit} />
        </TabsPanel>
        {employee.employmentTerms && (
          <TabsPanel value="terms" className="subtle-scrollbar flex-1 overflow-y-auto px-6 py-6">
            <EmploymentTermsTab
              employeeId={employee.id}
              firstName={employee.firstName}
              employmentTerms={employee.employmentTerms}
              viewerIsPerson={me.employee?.id === employee.id}
              linksToSettings={operations.includes("MANAGE_WORKSPACE")}
            />
          </TabsPanel>
        )}
        <TabsPanel value="history" className="subtle-scrollbar flex-1 overflow-y-auto px-6 py-6">
          <EmployeeHistory employeeId={employee.id} />
        </TabsPanel>
      </Tabs>

      {draft.changed.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <EditBar
            changedLabels={changedLabels}
            reason={draft.reason}
            onReasonChange={draft.setReason}
            saving={draft.saving}
            failureMessage={
              draft.failure &&
              t(draft.failure === "removed" ? "people.panel.saveRemoved" : "records.edit.failed")
            }
            onCancel={draft.cancel}
            onSave={() => void draft.save()}
          />
        </div>
      )}

      <DiscardChangesDialog
        open={blocker.status === "blocked"}
        count={draft.changed.length}
        name={fullName}
        // Navigation goes on once nothing is changed; a tab switch keeps the record open.
        onDiscard={draft.cancel}
        onKeepEditing={() => blocker.reset?.()}
      />
      <InviteDialog people={[employee]} open={inviting} onOpenChange={setInviting} />
      <CopiedLinkDialog link={copiedLink} onClose={() => setCopiedLink(null)} />
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

const EMAIL_FIELD = EMPLOYEE_DESCRIPTION.fields.find((field) => field.key === "email")!;
