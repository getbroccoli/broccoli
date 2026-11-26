import { useId, useState } from "react";
import { toast } from "sonner";

import {
  AdjustAllowanceDocument,
  type AdjustAllowanceMutation,
  AllowanceHistoryDocument,
} from "@/__generated__/graphql";
import { PayloadFailure, usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { t } from "@/i18n";
import { formatDays } from "@/lib/formatDays";

import { adjustLabel, parseAdjustment } from "./allowanceHistoryText";

type Props = {
  allowanceId: string;
  /** The person's first name, and whether the reader is that person. */
  person: { firstName: string; isReader: boolean };
  /** The card's type name and leave year, as its heading shows them. */
  typeName: string;
  period: string;
  remaining: number;
  onClose: () => void;
};

/** The most a comment holds, as the API allows. */
const MAX_COMMENT_LENGTH = 1_000;

/** Adds days to or takes days from a balance, with a comment the person and their managers read. */
export function AdjustAllowanceDialog({
  allowanceId,
  person,
  typeName,
  period,
  remaining,
  onClose,
}: Props) {
  const [daysText, setDaysText] = useState("");
  const [comment, setComment] = useState("");
  // One per adjustment meant, so trying again after a lost answer adds nothing twice.
  const [requestId] = useState(newRequestId);
  const daysId = useId();
  const commentId = useId();
  // The payload updates the card's figures in the cache; only the history needs the server.
  const [adjust, { loading, payloadError }] = usePayloadMutation(AdjustAllowanceDocument, {
    refetch: [AllowanceHistoryDocument],
  });
  const days = parseAdjustment(daysText);
  const canSave = days !== null && comment.trim() !== "" && !loading;

  const save = async () => {
    const adjusted = await adjust({
      variables: { input: { allowanceId, amount: days!, comment: comment.trim(), requestId } },
    }).catch((error: unknown) => {
      // A refusal shows in the dialog; anything else may work on a second try.
      if (!(error instanceof PayloadFailure)) toast.error(t("people.panel.timeOff.adjust.failed"));
      return null;
    });
    if (!adjusted) {
      return;
    }
    toast(t("people.panel.timeOff.adjust.done", { name: person.firstName, type: typeName }));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !loading && onClose()}>
      <DialogContent
        closeLabel={t("people.panel.close")}
        className="max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:rounded-none sm:max-w-md"
      >
        <DialogTitle className="text-lg">
          {t("people.panel.timeOff.adjust.title", {
            name: person.firstName,
            type: typeName,
            period,
          })}
        </DialogTitle>
        <div className="flex flex-col gap-2">
          <label htmlFor={daysId} className="text-[13px] font-medium text-muted-foreground">
            {t("people.panel.timeOff.adjust.days")}
          </label>
          <Input
            id={daysId}
            inputMode="decimal"
            value={daysText}
            aria-describedby={`${daysId}-hint`}
            onChange={(event) => setDaysText(event.target.value)}
          />
          <DialogDescription id={`${daysId}-hint`} className="text-xs">
            {days !== null
              ? t("people.panel.timeOff.adjust.preview", {
                  before: formatDays(remaining),
                  after: formatDays(remaining + days),
                })
              : daysText.trim() === ""
                ? t("people.panel.timeOff.adjust.daysHint")
                : t("people.panel.timeOff.adjust.daysInvalid")}
          </DialogDescription>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={commentId} className="text-[13px] font-medium text-muted-foreground">
            {t("people.panel.timeOff.adjust.comment")}
          </label>
          <textarea
            id={commentId}
            value={comment}
            maxLength={MAX_COMMENT_LENGTH}
            rows={3}
            required
            aria-describedby={`${commentId}-hint`}
            onChange={(event) => setComment(event.target.value)}
            className="min-h-20 resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <p id={`${commentId}-hint`} className="text-xs text-muted-foreground">
            {person.isReader
              ? t("people.panel.timeOff.adjust.commentHintSelf")
              : t("people.panel.timeOff.adjust.commentHint", { name: person.firstName })}
          </p>
        </div>
        {payloadError && (
          <p role="alert" className="text-sm text-destructive">
            {refusalMessage(payloadError)}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={loading} onClick={onClose}>
            {t("people.panel.timeOff.adjust.cancel")}
          </Button>
          <Button disabled={!canSave} onClick={() => void save()}>
            {days === null ? t("people.panel.timeOff.adjust.save") : adjustLabel(days)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type AdjustRefusal = NonNullable<AdjustAllowanceMutation["timeOff"]["adjustAllowance"]["error"]>;

/** Why the server refused, worded for the one thing the admin can do about it. */
function refusalMessage(error: AdjustRefusal): string {
  const fields =
    error.__typename === "InvalidInputError" ? error.fields.map(({ field }) => field) : [];
  if (fields.includes("requestId")) {
    return t("people.panel.timeOff.adjust.alreadySaved");
  }
  return fields.includes("amount") || fields.includes("comment")
    ? t("people.panel.timeOff.adjust.refused")
    : t("people.panel.timeOff.adjust.balanceChanged");
}

/** A uuid for this adjustment; `crypto.randomUUID` only exists on secure origins, plain HTTP lacks it. */
function newRequestId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
