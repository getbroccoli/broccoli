import { useQuery } from "@apollo/client/react";
import { Check, Copy } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  InviteDeliveryDocument,
  InviteEmployeesDocument,
  type InviteDelivery,
  type SignInStatusFragment,
} from "@/__generated__/graphql";
import { usePayloadMutation } from "@/apollo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { t, type MessageKey } from "@/i18n";
import { useCopyToClipboard } from "@/lib/useCopyToClipboard";

import { formatExpiryDay, groupInvitees, type SkipReason } from "./signInStatus";

/** A person the dialog may invite. */
export interface Invitee {
  id: string;
  firstName: string;
  lastName: string;
  signInStatus?: SignInStatusFragment | null;
}

type Props = {
  people: readonly Invitee[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs once the invites exist, such as clearing the selection. */
  onInvited?: () => void;
};

const SKIP_REASONS: Record<SkipReason, MessageKey> = {
  joined: "invites.dialog.joined",
  hasAccount: "invites.dialog.hasAccount",
  sampleData: "invites.dialog.sampleData",
};

/** The API takes this many people per call; larger selections go in several. */
const PEOPLE_PER_CALL = 1_000;

/**
 * Invites the people chosen: who gets an invite and who is skipped, their permissions, a note
 * for emailed invites, then either a toast or the links to copy.
 */
export function InviteDialog({ people, open, onOpenChange, onInvited }: Props) {
  const { data } = useQuery(InviteDeliveryDocument, { skip: !open });
  const [admin, setAdmin] = useState(false);
  const [note, setNote] = useState("");
  const [links, setLinks] = useState<CopiedLink[] | null>(null);
  const [invite, { loading, error, payloadError }] = usePayloadMutation(InviteEmployeesDocument);
  const { invited, skipped } = groupInvitees(people);
  const delivery = data?.setup.inviteDelivery ?? "COPIED_BY_OWNER";
  const byEmail = delivery === "SENT_BY_EMAIL";
  const nameOf = (id: string) => {
    const person = people.find((candidate) => candidate.id === id);
    return person ? `${person.firstName} ${person.lastName}` : "";
  };

  const send = async (chosen: InviteDelivery) => {
    const employeeIds = invited.map(({ person }) => person.id);
    const sent = [];
    try {
      for (let start = 0; start < employeeIds.length; start += PEOPLE_PER_CALL) {
        const payload = await invite({
          variables: {
            input: {
              employeeIds: employeeIds.slice(start, start + PEOPLE_PER_CALL),
              profiles: admin ? ["ADMIN"] : [],
              note: chosen === "SENT_BY_EMAIL" ? note.trim() || null : null,
              delivery: chosen,
            },
          },
        });
        sent.push(...(payload.invites ?? []));
      }
    } catch {
      return;
    }
    onInvited?.();
    const copied = sent.flatMap(({ employee, link, expiresAt }) =>
      link ? [{ id: employee.id, name: nameOf(employee.id), link, expiresAt }] : [],
    );
    if (copied.length > 0) {
      setLinks(copied);
      return;
    }
    toast(
      sent.length === 1
        ? t("invites.dialog.sentOne")
        : t("invites.dialog.sent", { count: String(sent.length) }),
    );
    close();
  };

  const close = () => {
    onOpenChange(false);
    setLinks(null);
    setNote("");
    setAdmin(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        {links ? (
          <CopyLinks links={links} onDone={close} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {people.length === 1
                  ? t("invites.dialog.titleOne", { name: nameOf(people[0]!.id) })
                  : t("invites.dialog.title", { count: String(people.length) })}
              </DialogTitle>
            </DialogHeader>
            <div className="subtle-scrollbar flex max-h-[40vh] flex-col gap-3 overflow-y-auto">
              {invited.length > 0 && (
                <PeopleList title={t("invites.dialog.getsInvite")}>
                  {invited.map(({ person, replacesLink }) => (
                    <li key={person.id}>
                      {nameOf(person.id)}
                      {replacesLink && (
                        <span className="text-muted-foreground">{` · ${t("invites.dialog.newLink")}`}</span>
                      )}
                    </li>
                  ))}
                </PeopleList>
              )}
              {skipped.length > 0 && (
                <PeopleList title={t("invites.dialog.skipped")}>
                  {skipped.map(({ person, reason }) => (
                    <li key={person.id} className="text-muted-foreground">
                      {`${nameOf(person.id)} · ${t(SKIP_REASONS[reason])}`}
                    </li>
                  ))}
                </PeopleList>
              )}
              {invited.length === 0 && (
                <p className="text-sm text-muted-foreground">{t("invites.dialog.nobody")}</p>
              )}
            </div>
            {invited.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">
                  {t("invites.dialog.permissions")}
                </legend>
                <Label className="font-normal">
                  <Checkbox checked disabled />
                  {t("invites.dialog.employee")}
                  <span className="text-muted-foreground">{t("invites.dialog.employeeHint")}</span>
                </Label>
                <Label className="font-normal">
                  <Checkbox checked={admin} onCheckedChange={setAdmin} />
                  {t("invites.dialog.admin")}
                  <span className="text-muted-foreground">{t("invites.dialog.adminHint")}</span>
                </Label>
              </fieldset>
            )}
            {invited.length > 0 && byEmail && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-note">{t("invites.dialog.note")}</Label>
                <textarea
                  id="invite-note"
                  value={note}
                  maxLength={1000}
                  rows={3}
                  onChange={(event) => setNote(event.target.value)}
                  aria-describedby="invite-note-hint"
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
                <p id="invite-note-hint" className="text-sm text-muted-foreground">
                  {t("invites.dialog.noteHint")}{" "}
                  {data?.setup.mail?.from && (
                    <Link to="/settings" className="underline underline-offset-2">
                      {t("invites.dialog.emailedFrom", { from: data.setup.mail.from })}
                    </Link>
                  )}
                </p>
              </div>
            )}
            {(error || payloadError) && (
              <p role="alert" className="text-sm text-destructive">
                {t("invites.dialog.failed")}
              </p>
            )}
            <DialogFooter>
              <Button variant="ghost" disabled={loading} onClick={close}>
                {t("invites.dialog.cancel")}
              </Button>
              {invited.length > 0 && byEmail && (
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => void send("COPIED_BY_OWNER")}
                >
                  {t("invites.dialog.copyInstead")}
                </Button>
              )}
              {invited.length > 0 && (
                <Button disabled={loading} onClick={() => void send(delivery)}>
                  {loading ? t("invites.dialog.pending") : submitLabel(byEmail, invited.length)}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CopiedLink {
  id: string;
  name: string;
  link: string;
  expiresAt: string;
}

/** The links of new invites, shown once: each person's own, or all as a list. */
function CopyLinks({ links, onDone }: { links: CopiedLink[]; onDone: () => void }) {
  const date = formatExpiryDay(links[0]!.expiresAt);
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {links.length === 1
            ? t("invites.links.titleOne")
            : t("invites.links.title", { count: String(links.length) })}
        </DialogTitle>
        <DialogDescription>{t("invites.links.detail", { date })}</DialogDescription>
      </DialogHeader>
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">{t("invites.links.warning")}</p>
      <ul className="subtle-scrollbar flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        {links.map(({ id, name, link }) => (
          <li key={id} className="flex items-center gap-3 py-1 text-sm">
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <CopyButton text={link} label={t("invites.links.copy")} />
          </li>
        ))}
      </ul>
      <DialogFooter>
        {links.length > 1 && (
          <CopyButton
            text={links.map(({ name, link }) => `${name}: ${link}`).join("\n")}
            label={t("invites.links.copyAll")}
          />
        )}
        <Button onClick={onDone}>{t("invites.links.done")}</Button>
      </DialogFooter>
    </>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { copied, copy } = useCopyToClipboard();
  return (
    <Button size="sm" variant="outline" onClick={() => void copy(text)}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? t("invites.links.copied") : label}
    </Button>
  );
}

function PeopleList({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="flex flex-col gap-0.5 text-sm">{children}</ul>
    </section>
  );
}

function submitLabel(byEmail: boolean, count: number): string {
  if (byEmail) {
    return count === 1
      ? t("invites.dialog.sendOne")
      : t("invites.dialog.send", { count: String(count) });
  }
  return count === 1
    ? t("invites.dialog.createLink")
    : t("invites.dialog.createLinks", { count: String(count) });
}
