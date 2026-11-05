import { useState } from "react";
import { toast } from "sonner";

import {
  RecordHistoryDocument,
  UpdateTimeOffTypeDocument,
  type UpdateTimeOffTypeMutation,
  TimeOffSettingsDocument,
  type TimeOffTypePanel_TypeFragment,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { t } from "@/i18n";

import { rememberTimeOffType } from "../cache";

import {
  changeCount,
  draftErrors,
  draftOf,
  newPolicyDraft,
  type PolicyDraft,
  prepareSave,
  type PreparedSave,
  type TypeDraft,
  withPolicyEdited,
  withPolicyRemoved,
} from "./timeOffTypeDraft";

type SaveError = NonNullable<UpdateTimeOffTypeMutation["timeOffType"]["update"]["error"]>;

/** A field's error: the type's own (`name`) or a policy's (`<policy key>.<field>`), by its code. */
export type FieldErrors = Record<string, string>;

/** The panel's edits of one saved type, and its one Save. */
export function useTimeOffTypeDraft(type: TimeOffTypePanel_TypeFragment) {
  const [saved, setSaved] = useState(() => draftOf(type));
  const [draft, setDraft] = useState(saved);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const save = useSave((savedType) => {
    const next = draftOf(savedType);
    setSaved(next);
    setDraft(next);
    setFieldErrors({});
  });

  return {
    saved,
    draft,
    changes: changeCount(saved, draft),
    // What the draft breaks shows as it is typed; the server's refusals wait for the next save.
    fieldErrors: { ...fieldErrors, ...draftErrors(draft) },
    invalid: Object.keys(draftErrors(draft)).length > 0,
    failure: save.failure,
    saving: save.saving,
    editType: (fields: Partial<Omit<TypeDraft, "policies">>) =>
      setDraft((current) => ({ ...current, ...fields })),
    editPolicy: (key: string, fields: Partial<PolicyDraft>) =>
      setDraft((current) => withPolicyEdited(saved, current, key, fields)),
    addPolicy: () =>
      setDraft((current) => ({
        ...current,
        policies: [...current.policies, newPolicyDraft(type, crypto.randomUUID())],
      })),
    removePolicy: (key: string) => setDraft((current) => withPolicyRemoved(current, key)),
    cancel: () => {
      setDraft(saved);
      setFieldErrors({});
      save.reset();
    },
    submit: async () =>
      setFieldErrors(await save.run(prepareSave(type.timeOffType.id, saved, draft))),
  };
}

/** Sends one save; resolves with the field errors to show, none after a success. */
function useSave(onSaved: (savedType: TimeOffTypePanel_TypeFragment) => void) {
  // The list and the history show what only the server works out: people, order, the standard copy.
  const [mutate, { loading, error, payloadError, reset }] = usePayloadMutation(
    UpdateTimeOffTypeDocument,
    {
      update: (cache, { data }) => {
        const savedType = data?.timeOffType.update.timeOffType;
        if (savedType) rememberTimeOffType(cache, savedType);
      },
      refetch: [TimeOffSettingsDocument, RecordHistoryDocument],
    },
  );
  const failure =
    payloadError && payloadError.__typename !== "InvalidInputError"
      ? payloadError.message
      : error
        ? t("settings.timeOffType.saveFailed")
        : null;

  const run = async (prepared: PreparedSave | null): Promise<FieldErrors> => {
    if (!prepared) return {};
    try {
      const payload = await mutate({ variables: { input: prepared.input } });
      onSaved(payload.timeOffType!);
      toast(savedMessage(payload.timeOffType!.timeOffType.name, payload.allowancesUpdated ?? 0));
      return {};
    } catch (failed) {
      const refused =
        failed instanceof PayloadFailure
          ? (failed as PayloadFailure<SaveError>).payloadError
          : null;
      return refused?.__typename === "InvalidInputError"
        ? placeErrors(prepared, refused.fields)
        : {};
    }
  };

  return { run, saving: loading, failure, reset };
}

/** Puts each refused input field on the draft field it came from. */
function placeErrors(
  { policyKeys, addedKeys }: PreparedSave,
  fields: { field: string; code: string }[],
): FieldErrors {
  return Object.fromEntries(
    fields.map(({ field, code }) => {
      const [list, index, name] = field.split(".");
      const keys = list === "policies" ? policyKeys : list === "addPolicies" ? addedKeys : null;
      return [keys ? `${keys[Number(index)]}.${name}` : field, code];
    }),
  );
}

function savedMessage(name: string, allowancesUpdated: number): string {
  if (allowancesUpdated === 0) return t("settings.timeOffType.saved", { name });
  return allowancesUpdated === 1
    ? t("settings.timeOffType.savedOne", { name })
    : t("settings.timeOffType.savedMany", { name, count: String(allowancesUpdated) });
}
