import { useId, useState } from "react";
import { toast } from "sonner";

import {
  AdjustAllowanceDocument,
  AllowanceHistoryDocument,
  EmployeePanelDocument,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
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
  const daysId = useId();
  const commentId = useId();
  const [adjust, { loading }] = usePayloadMutation(AdjustAllowanceDocument, {
    refetch: [EmployeePanelDocument, AllowanceHistoryDocument],
  });
  const days = parseAdjustment(daysText);
  const canSave = days !== null && comment.trim() !== "" && !loading;

  const save = async () => {
    const adjusted = await adjust({
      variables: { input: { allowanceId, amount: days!, comment: comment.trim() } },
    }).catch(() => null);
    if (!adjusted) {
      toast.error(t("people.panel.timeOff.adjust.failed"));
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
            {days === null
              ? t("people.panel.timeOff.adjust.daysHint")
              : t("people.panel.timeOff.adjust.preview", {
                  before: formatDays(remaining),
                  after: formatDays(remaining + days),
                })}
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
