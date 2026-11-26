import { useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  BookTimeOffDocument,
  EmployeePanelDocument,
  MyTasksDocument,
  RequestTimeOffDocument,
  TimeOffBookingPreviewDocument,
  WhosOutDocument,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import type { DialogMode } from "@/features/employees";
import { t } from "@/i18n";

import { evictWhosOut } from "../cache";
import { bookedToast, requestedToast } from "../timeOffText";
import type { BookingDraft } from "./useBookingDraft";

/** Books the draft or asks for it, as the mode says, then says so and closes the dialog. */
export function useSaveTimeOff({
  draft,
  mode,
  person,
  viewerEmployeeId,
  onClose,
}: {
  draft: BookingDraft;
  mode: DialogMode;
  person: { id: string; firstName: string } | undefined;
  viewerEmployeeId: string | null;
  onClose: () => void;
}) {
  const update = (cache: Parameters<typeof evictWhosOut>[0]) =>
    evictWhosOut(cache, draft.employeeId);
  const refetch = [WhosOutDocument, EmployeePanelDocument, TimeOffBookingPreviewDocument];
  const [book, booking] = usePayloadMutation(BookTimeOffDocument, { update, refetch });
  // A request gives the requester a task in Waiting on others.
  const [request, requesting] = usePayloadMutation(RequestTimeOffDocument, {
    update,
    refetch: [...refetch, MyTasksDocument],
  });
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const save = async () => {
    const variables = { input: draft.input! };
    const saved = await (mode === "book" ? book({ variables }) : request({ variables })).catch(
      (error: unknown) => {
        refused(error, mode, draft);
        return null;
      },
    );
    if (!saved?.timeOff || !person) {
      return;
    }
    announce(saved.timeOff, mode, person.id === viewerEmployeeId ? null : person.firstName);
    // Browser Back may have closed this dialog and opened another while saving.
    if (mounted.current) onClose();
  };

  return { save, saving: booking.loading || requesting.loading };
}

/**
 * Says why saving failed: a rule broken since the preview, which the fresh preview explains, or
 * anything else. Types are read again too, so a type's changed approval turns Book and Request.
 */
function refused(error: unknown, mode: DialogMode, draft: BookingDraft) {
  draft.refresh();
  const conflict =
    error instanceof PayloadFailure &&
    (error.payloadError as { __typename: string }).__typename === "ConflictError";
  if (error instanceof PayloadFailure && !conflict) {
    toast.error(mode === "book" ? t("timeOff.dialog.refused") : t("timeOff.dialog.requestRefused"));
    return;
  }
  // A conflict is an approval that could not start, a setup fault the viewer can retry.
  toast.error(mode === "book" ? t("timeOff.dialog.failed") : t("timeOff.dialog.requestFailed"));
}

/** Says what saving did: booked, requested, or a request that ended at once with nobody to approve it. */
function announce(
  timeOff: { cost?: number | null; status?: string | null },
  mode: DialogMode,
  /** Null when the viewer booked their own. */
  firstName: string | null,
) {
  const cost = timeOff.cost ?? 0;
  if (timeOff.status === "CANCELLED") {
    // Nobody can approve it, so the approval ended at once and the request with it.
    toast.error(t("timeOff.text.requestEnded"));
    return;
  }
  toast(
    mode === "book" ? bookedToast(cost, firstName ?? "", firstName === null) : requestedToast(cost),
  );
}
