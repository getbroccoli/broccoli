// eslint-disable-next-line no-restricted-imports -- A permission change needs resetStore(), not just the cache.
import { useApolloClient } from "@apollo/client/react";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import {
  SetPermissionProfilesDocument,
  UpdateEmployeeDocument,
  type EmployeePanel_EmployeeFragment,
  type PermissionProfile,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { addHistoryLine } from "@/features/records";
import { t, type MessageKey } from "@/i18n";

import {
  changedFields,
  type EmployeeFieldKey,
  type EmployeeValues,
  toUpdateInput,
} from "./employeeDraft";

/** Why the last save failed, for the edit bar: a removed employee or any other failure. */
export type SaveFailure = "removed" | "failed";

/**
 * The panel's unsaved edits of one employee: the changed values, the reason, and one save for
 * all of them. A refused or failed save keeps every edit.
 */
export function useEmployeeDraft(employee: EmployeePanel_EmployeeFragment) {
  const apolloClient = useApolloClient();
  const router = useRouter();
  const saved = valuesOf(employee);
  const [edits, setEdits] = useState<Edits>({});
  const [reason, setReason] = useState("");
  const [updateEmployee, update] = usePayloadMutation(UpdateEmployeeDocument, {
    // The saved employee updates in the cache by itself; its new line joins its history.
    update: (cache, { data }) => {
      const line = data?.employee.update.historyLine;
      if (line) addHistoryLine(cache, { recordType: "EMPLOYEE", recordId: employee.id, line });
    },
  });
  const [setPermissionProfiles, profileChange] = usePayloadMutation(SetPermissionProfilesDocument, {
    update: (cache, { data }) => {
      const line = data?.employee.setPermissionProfiles.historyLine;
      if (line) addHistoryLine(cache, { recordType: "EMPLOYEE", recordId: employee.id, line });
    },
  });
  const saving = update.loading || profileChange.loading;
  const error = update.error ?? profileChange.error;
  const payloadError = update.payloadError ?? profileChange.payloadError;
  const draft = mapEdits(edits, ({ value }) => value);
  const fieldErrors = mapEdits(edits, ({ error }) => error);
  const changed = changedFields(saved, draft);
  // Refused fields show beside themselves; any other failed save shows in the edit bar.
  const failure: SaveFailure | null =
    payloadError?.__typename === "NotFoundError"
      ? "removed"
      : error || (payloadError && payloadError.__typename !== "InvalidInputError")
        ? "failed"
        : null;

  // A new value replaces the field's edit, and with it the error the last save gave it.
  const edit = (key: EmployeeFieldKey, value: string) =>
    setEdits((current) => ({ ...current, [key]: { value } }));

  const revert = (key: EmployeeFieldKey) =>
    setEdits((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });

  const cancel = () => {
    setEdits({});
    setReason("");
    update.reset();
    profileChange.reset();
  };

  const save = async () => {
    // The draft is what gets saved, so it stays still until the save ends.
    if (saving) return;
    setEdits((current) => mapEdits(current, ({ value }) => ({ value })));
    try {
      // The profile saves second, so a refused field leaves it unsaved with the rest.
      if (changed.some((key) => key !== "permissionProfiles")) {
        await updateEmployee({
          variables: { input: toUpdateInput(employee.id, saved, draft, reason) },
        });
      }
      if (changed.includes("permissionProfiles")) {
        const changeReason = reason.trim() || null;
        const profiles = (draft.permissionProfiles ?? "").split(",") as PermissionProfile[];
        await setPermissionProfiles({
          variables: { input: { id: employee.id, profiles, changeReason } },
        });
        // The change may be the caller's own, so what they may do is read again, the route
        // first: a query they may no longer run is refused while the cache refetches.
        await router.invalidate();
        await apolloClient.resetStore().catch(() => undefined);
      }
      cancel();
    } catch (failed) {
      const refused =
        failed instanceof PayloadFailure ? (failed.payloadError as typeof payloadError) : null;
      if (refused?.__typename !== "InvalidInputError") return;
      const messages = new Map(
        refused.fields.map(({ field, code }) => [draftKey(field), fieldMessage(code)]),
      );
      setEdits((current) =>
        mapEdits(current, ({ value }, key) => ({ value, error: messages.get(key) })),
      );
    }
  };

  return {
    saved,
    draft,
    changed,
    reason,
    setReason,
    fieldErrors,
    failure,
    saving,
    edit,
    revert,
    cancel,
    save,
  };
}

/** The unsaved fields: each new value, and why the last save refused it until it changes. */
type Edits = Partial<Record<EmployeeFieldKey, { value: string; error?: string }>>;

function mapEdits<Result>(
  edits: Edits,
  map: (edit: { value: string; error?: string }, key: EmployeeFieldKey) => Result,
): Partial<Record<EmployeeFieldKey, Result>> {
  return Object.fromEntries(
    Object.entries(edits).map(([key, edit]) => [key, map(edit, key as EmployeeFieldKey)]),
  );
}

function valuesOf(employee: EmployeePanel_EmployeeFragment): EmployeeValues {
  const { firstName, lastName, email, jobTitle, managerId, startDate, permissionProfiles } =
    employee;
  return {
    firstName,
    lastName,
    email,
    jobTitle: jobTitle ?? null,
    manager: managerId ?? null,
    startDate: startDate ?? null,
    permissionProfiles: permissionProfiles?.join(",") ?? null,
  };
}

/** The draft field an input field's error belongs to. */
function draftKey(field: string): string {
  return field === "managerId" ? "manager" : field;
}

function fieldMessage(code: string): string {
  return t(FIELD_MESSAGES[code] ?? "people.panel.error.invalid");
}

const FIELD_MESSAGES: Partial<Record<string, MessageKey>> = {
  required: "people.panel.error.required",
  too_long: "people.panel.error.tooLong",
  taken: "people.panel.error.taken",
  not_found: "people.panel.error.managerNotFound",
  self: "people.panel.error.managerSelf",
  loop: "people.panel.error.managerLoop",
};
