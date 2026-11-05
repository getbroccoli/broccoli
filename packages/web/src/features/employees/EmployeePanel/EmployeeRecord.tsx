import { useBlocker, useRouteContext } from "@tanstack/react-router";
import { DotsThree, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { EmployeePanel_EmployeeFragment } from "@/__generated__/graphql";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SheetClose, SheetTitle } from "@/components/ui/sheet";
import {
  type CopiedLink,
  CopiedLinkDialog,
  InviteDialog,
  InviteMenuItems,
} from "@/features/invites";
import { DiscardChangesDialog, EditBar, FieldValue, RecordHistory } from "@/features/records";
import { t } from "@/i18n";

import { Avatar } from "../Avatar";
import { EmployeeDetails } from "./EmployeeDetails";
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
 * One loaded person in their panel: header, key facts, fields edited in place with one Save,
 * and their history. Leaving with unsaved changes asks first.
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
  const { operations } = useRouteContext({ from: "/_authenticated" }).me;
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
        {/* Only admins see a sign-in status, and with it the invite actions. */}
        {(employee.access.canDelete || employee.signInStatus) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" aria-label={t("people.panel.more")} />}
            >
              <DotsThree weight="bold" />
            </DropdownMenuTrigger>
            {/* As wide as its item, not the trigger, so the name stays on one line. */}
            <DropdownMenuContent align="end" className="w-auto max-w-80">
              <InviteMenuItems
                person={employee}
                onInvite={() => setInviting(true)}
                onLinkCreated={setCopiedLink}
              />
              {employee.access.canDelete && (
                <DropdownMenuItem variant="destructive" onClick={() => setRemoving(true)}>
                  <span className="truncate">
                    {t("people.panel.remove.menu", { name: fullName })}
                  </span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <SheetClose
          render={<Button variant="ghost" size="icon" aria-label={t("people.panel.close")} />}
        >
          <X />
        </SheetClose>
      </header>

      <div className="subtle-scrollbar flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-6">
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
            draft.fieldErrors.email ? "invalid" : draft.changed.includes("email") ? "changed" : null
          }
          signIn={
            employee.signInStatus
              ? { status: employee.signInStatus, onInvite: () => setInviting(true) }
              : null
          }
        />

        <EmployeeDetails employee={employee} draft={draft} canEdit={canEdit} />

        {employee.timeOffTypes && <TimeOffSection timeOffTypes={employee.timeOffTypes} />}

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
        onDiscard={() => blocker.proceed?.()}
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
