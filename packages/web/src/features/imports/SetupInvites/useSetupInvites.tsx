import { useQuery } from "@apollo/client/react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import {
  type SetupInviteAudience,
  SetupInviteesDocument,
  type SetupPersonFragment,
} from "@/__generated__/graphql";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { type CopiedLink, CopyLinks } from "@/features/invites";
import type { SetupInviteSearch } from "@/features/setup";
import { t } from "@/i18n";

/** An invite setup's last step sent, as the API answers. */
export interface SentSetupInvite {
  employeeId: string;
  name: string;
  expiresAt: string;
  link?: string | null;
}

/** Setup's last page's invites: who, how, the note, and what finishing sends. */
export interface SetupInvites {
  /** Whether the owner chose anyone beside the admins. */
  inviting: boolean;
  invitees: SetupPersonFragment[];
  company: string;
  byEmail: boolean;
  /** Whether the invitees are known, or nobody is invited. */
  loaded: boolean;
  /** Whether reading the invitees failed; finishing waits until they are known. */
  failed: boolean;
  note: string;
  setNote: (note: string) => void;
  /** What the finish sends; the note only when invites go by email. */
  choices: {
    ownerEmployeeKey: string | null;
    inviteAudience: SetupInviteAudience;
    inviteNote: string | null;
  };
  /** Waits until the owner has copied the links, or toasts how many emails went. */
  finish: (invites: readonly SentSetupInvite[]) => Promise<void>;
  /** The dialog `finish` shows links in; render it on the page. */
  linksDialog: ReactNode;
}

/**
 * What setup's last page needs to invite the people the owner chose: who they are, how invites
 * go, the note, and `finish`, which waits on the links dialog in link mode or toasts the count.
 */
export function useSetupInvites(
  search: SetupInviteSearch,
  /** The email the owner is signing up with, before their account exists; else theirs. */
  ownerEmail: string | null = null,
): SetupInvites {
  const inviting = search.audience !== "ONLY_ADMINS";
  const { data, error, loading } = useQuery(SetupInviteesDocument, {
    variables: { audience: search.audience, me: search.me ?? null, ownerEmail },
    skip: !inviting,
    fetchPolicy: "network-only",
  });
  const [note, setNote] = useState("");
  const [links, setLinks] = useState<{ links: CopiedLink[]; done: () => void } | null>(null);
  const byEmail = data?.setup.inviteDelivery === "SENT_BY_EMAIL";

  const finish = async (invites: readonly SentSetupInvite[]) => {
    const copied = invites.flatMap(({ employeeId, name, expiresAt, link }) =>
      link ? [{ id: employeeId, name, link, expiresAt }] : [],
    );
    if (copied.length > 0) {
      await new Promise<void>((done) => setLinks({ links: copied, done }));
    } else if (invites.length > 0) {
      toast(
        invites.length === 1
          ? t("invites.dialog.sentOne")
          : t("invites.dialog.sent", { count: String(invites.length) }),
      );
    }
  };

  const linksDialog = (
    <Dialog open={links !== null} onOpenChange={(open) => !open && links?.done()}>
      <DialogContent className="sm:max-w-lg" closeLabel={t("invites.dialog.close")}>
        {links && <CopyLinks links={links.links} onDone={links.done} />}
      </DialogContent>
    </Dialog>
  );

  return {
    inviting,
    invitees: data?.import.setupInvitees ?? [],
    company: data?.company.name ?? "",
    byEmail,
    loaded: !inviting || (data !== undefined && !loading),
    failed: error !== undefined,
    note,
    setNote,
    choices: {
      ownerEmployeeKey: search.me ?? null,
      inviteAudience: search.audience,
      inviteNote: byEmail ? note.trim() || null : null,
    },
    finish,
    linksDialog,
  };
}
