import { Dialog, DialogContent } from "@/components/ui/dialog";
import { t } from "@/i18n";

import { type CopiedLink, CopyLinks } from "./CopyLinks";

export type { CopiedLink };

type Props = {
  /** The link to show; none closes the dialog. */
  link: CopiedLink | null;
  onClose: () => void;
};

/** A new invite link made from a person's panel, shown once to copy. */
export function CopiedLinkDialog({ link, onClose }: Props) {
  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" closeLabel={t("invites.dialog.close")}>
        {link && <CopyLinks links={[link]} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
