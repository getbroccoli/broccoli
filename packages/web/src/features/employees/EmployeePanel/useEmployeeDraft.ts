// eslint-disable-next-line no-restricted-imports -- A permission change needs resetStore(), not just the cache.
import { useApolloClient } from "@apollo/client/react";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import {
  SetPermissionProfilesDocument,
  type SetPermissionProfilesMutation,
  UpdateEmployeeDocument,
  type UpdateEmployeeMutation,
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
  INPUT_KEYS,
  toUpdateInput,
} from "./employeeDraft";

/** Why the last save failed, for the edit bar: a removed employee or any other failure. */
export type SaveFailure = "removed" | "failed";

/**
 * The panel's unsaved edits of one employee: the changed values, the reason, and one save for
 * all of them. A refused or failed save keeps every edit.
 */
export function useEmployeeDraft(employee: EmployeePanel_EmployeeFragment) {
  const saved = valuesOf(employee);
  const [edits, setEdits] = useState<Edits>({});
  const [reason, setReason] = useState("");
  const { saving, failure, reset, saveChanges } = useSaveEmployee(employee.id);
  const draft = mapEdits(edits, ({ value }) => value);
  const fieldErrors = mapEdits(edits, ({ error }) => error);
  const changed = changedFields(saved, draft);

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
    reset();
  };

  const save = async () => {
    // The draft is what gets saved, so it stays still until the save ends.
    if (saving) return;
    setEdits((current) => mapEdits(current, ({ value }) => ({ value })));
    try {
      await saveChanges(saved, draft, reason);
      cancel();
    } catch (failed) {
      const messages = refusedFieldMessages(failed);
      if (!messages) return;
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

/**
 * Saves an employee's changed fields, then their permission profile, so a refused field leaves
 * the profile unsaved with the rest. A refused save rejects with a `PayloadFailure`.
 */
function useSaveEmployee(employeeId: string) {
  const apolloClient = useApolloClient();
  const router = useRouter();
  const [updateEmployee, update] = usePayloadMutation(UpdateEmployeeDocument, {
    // The saved employee updates in the cache by itself; its new line joins its history.
    update: (cache, { data }) => {
      const line = data?.employees.update.historyLine;
      if (line) addHistoryLine(cache, { recordType: "EMPLOYEE", recordId: employeeId, line });
    },
  });
  const [setPermissionProfiles, profileChange] = usePayloadMutation(SetPermissionProfilesDocument, {
    update: (cache, { data }) => {
      const line = data?.employees.setPermissionProfiles.historyLine;
      if (line) addHistoryLine(cache, { recordType: "EMPLOYEE", recordId: employeeId, line });
    },
  });
  const error = update.error ?? profileChange.error;
  const payloadError = update.payloadError ?? profileChange.payloadError;
  // Refused fields show beside themselves; any other failed save shows in the edit bar.
  const failure: SaveFailure | null =
    payloadError?.__typename === "NotFoundError"
      ? "removed"
      : error || (payloadError && payloadError.__typename !== "InvalidInputError")
        ? "failed"
        : null;
  return {
    saving: update.loading || profileChange.loading,
    failure,
    reset: () => {
      update.reset();
      profileChange.reset();
    },
    saveChanges: async (saved: EmployeeValues, draft: Partial<EmployeeValues>, reason: string) => {
      const changed = changedFields(saved, draft);
      if (changed.some((key) => key !== "permissionProfiles")) {
        await updateEmployee({
          variables: { input: toUpdateInput(employeeId, saved, draft, reason) },
        });
      }
      if (changed.includes("permissionProfiles")) {
        const changeReason = reason.trim() || null;
        const profiles = (draft.permissionProfiles ?? "").split(",") as PermissionProfile[];
        await setPermissionProfiles({
          variables: { input: { id: employeeId, profiles, changeReason } },
        });
        // The change may be the caller's own, so what they may do is read again, the route
        // first: a query they may no longer run is refused while the cache refetches.
        await router.invalidate();
        await apolloClient.resetStore().catch(() => undefined);
      }
    },
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
  const {
    firstName,
    lastName,
    email,
    jobTitle,
    location,
    managerId,
    startDate,
    permissionProfiles,
  } = employee;
  return {
    firstName,
    lastName,
    email,
    jobTitle: jobTitle ?? null,
    location: location?.id ?? null,
    manager: managerId ?? null,
    startDate: startDate ?? null,
    permissionProfiles: permissionProfiles?.join(",") ?? null,
  };
}

/** Each refused field's message by its draft field, or null when the save failed otherwise. */
function refusedFieldMessages(failed: unknown): Map<string, string> | null {
  const refused = failed instanceof PayloadFailure ? (failed.payloadError as SaveError) : null;
  if (refused?.__typename !== "InvalidInputError") return null;
  return new Map(
    refused.fields.map(({ field, code }) => [draftKey(field), fieldMessage(field, code)]),
  );
}

type SaveError =
  | UpdateEmployeeMutation["employees"]["update"]["error"]
  | SetPermissionProfilesMutation["employees"]["setPermissionProfiles"]["error"];

/** The draft field an input field's error belongs to. */
function draftKey(field: string): string {
  return Object.entries(INPUT_KEYS).find(([, input]) => input === field)?.[0] ?? field;
}

function fieldMessage(field: string, code: string): string {
  if (field === "locationId" && code === "not_found") {
    return t("people.panel.error.locationNotFound");
  }
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
