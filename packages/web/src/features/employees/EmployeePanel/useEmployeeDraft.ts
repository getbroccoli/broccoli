import { useState } from "react";

import {
  EmployeesDocument,
  RecordHistoryDocument,
  UpdateEmployeeDocument,
  type EmployeePanel_EmployeeFragment,
  type UpdateEmployeeMutation,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
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
  const saved = valuesOf(employee);
  const [draft, setDraft] = useState<Partial<EmployeeValues>>({});
  const [reason, setReason] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EmployeeFieldKey, string>>>({});
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [updateEmployee, { loading: saving }] = usePayloadMutation(UpdateEmployeeDocument, {
    refetch: [RecordHistoryDocument, EmployeesDocument],
  });
  const changed = changedFields(saved, draft);

  const edit = (key: EmployeeFieldKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => without(current, key));
  };

  const revert = (key: EmployeeFieldKey) => {
    setDraft((current) => without(current, key));
    setFieldErrors((current) => without(current, key));
  };

  const cancel = () => {
    setDraft({});
    setReason("");
    setFieldErrors({});
    setFailure(null);
  };

  const save = async () => {
    // The draft is what gets saved, so it stays still until the save ends.
    if (saving) return;
    setFailure(null);
    setFieldErrors({});
    try {
      await updateEmployee({
        variables: { input: toUpdateInput(employee.id, saved, draft, reason) },
      });
      cancel();
    } catch (error) {
      const refused = error instanceof PayloadFailure ? (error.payloadError as UpdateError) : null;
      if (refused?.__typename === "InvalidInputError") {
        setFieldErrors(
          Object.fromEntries(refused.fields.map(({ field, code }) => [field, fieldMessage(code)])),
        );
      } else {
        setFailure(refused?.__typename === "NotFoundError" ? "removed" : "failed");
      }
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

type UpdateError = UpdateEmployeeMutation["employee"]["update"]["error"];

function without<Value>(
  record: Partial<Record<EmployeeFieldKey, Value>>,
  key: EmployeeFieldKey,
): Partial<Record<EmployeeFieldKey, Value>> {
  const rest = { ...record };
  delete rest[key];
  return rest;
}

function valuesOf(employee: EmployeePanel_EmployeeFragment): EmployeeValues {
  const { firstName, lastName, email, jobTitle, startDate } = employee;
  return { firstName, lastName, email, jobTitle: jobTitle ?? null, startDate: startDate ?? null };
}

function fieldMessage(code: string): string {
  return t(FIELD_MESSAGES[code] ?? "people.panel.error.invalid");
}

const FIELD_MESSAGES: Partial<Record<string, MessageKey>> = {
  required: "people.panel.error.required",
  too_long: "people.panel.error.tooLong",
  taken: "people.panel.error.taken",
};
