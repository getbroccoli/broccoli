import { useRouteContext } from "@tanstack/react-router";

import { t } from "@/i18n";

import { PeopleNames } from "./PeopleNames";
import { setupPersonName } from "./setupPersonName";
import type { SetupInvites } from "./useSetupInvites";

type Props = {
  invites: SetupInvites;
  /** Whether the finish was refused for a link in the note. */
  noteHasLink: boolean;
};

/**
 * Setup's last page, when the owner chose to invite people: who gets an invite, what it looks
 * like, the note for emailed invites, and how they go out.
 */
export function SetupInviteSection({ invites, noteHasLink }: Props) {
  const { mode } = useRouteContext({ from: "__root__" });
  const { invitees, byEmail, company, note, setNote } = invites;
  if (!invites.inviting || !invites.loaded) {
    return null;
  }
  const names = invitees.map(setupPersonName);
  const sample = invitees[0]?.firstName.value ?? t("setup.invites.sampleName");

  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">
          {invitees.length === 1
            ? t("setup.invites.whoOne")
            : t("setup.invites.who", { count: String(invitees.length) })}
        </h2>
        <PeopleNames people={names} />
      </div>
      {invitees.length > 0 && (
        <figure
          aria-label={t("setup.invites.previewLabel")}
          className="flex flex-col gap-2 rounded-lg bg-muted/40 p-4 text-sm"
        >
          <p className="font-medium">{t("setup.invites.previewSubject", { company })}</p>
          <p>{t("setup.invites.previewGreeting", { name: sample })}</p>
          {byEmail && note.trim() && <p className="whitespace-pre-line">{note.trim()}</p>}
          <span className="self-start rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
            {t("invites.page.join", { company })}
          </span>
          <p className="text-muted-foreground">{t("setup.invites.previewExpiry")}</p>
        </figure>
      )}
      {invitees.length > 0 && byEmail && (
        <div className="flex flex-col gap-2">
          <label htmlFor="setup-invite-note" className="text-sm font-medium">
            {t("invites.dialog.note")}
          </label>
          <textarea
            id="setup-invite-note"
            value={note}
            maxLength={1000}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
            aria-describedby="setup-invite-note-hint"
            aria-invalid={noteHasLink || undefined}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {noteHasLink && (
            <p role="alert" className="text-sm text-destructive">
              {t("invites.dialog.noteHasLink")}
            </p>
          )}
        </div>
      )}
      {invitees.length > 0 && (
        <p id="setup-invite-note-hint" className="text-sm text-muted-foreground">
          {!byEmail
            ? t("setup.invites.byLink")
            : mode === "MANAGED"
              ? t("invites.dialog.emailedByBroccoli")
              : t("setup.invites.byEmail")}
        </p>
      )}
    </section>
  );
}
