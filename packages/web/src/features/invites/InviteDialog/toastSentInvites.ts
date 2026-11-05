import { toast } from "sonner";

import { t } from "@/i18n";

/** Toasts how many invite emails went. */
export function toastSentInvites(count: number) {
  toast(
    count === 1 ? t("invites.dialog.sentOne") : t("invites.dialog.sent", { count: String(count) }),
  );
}
