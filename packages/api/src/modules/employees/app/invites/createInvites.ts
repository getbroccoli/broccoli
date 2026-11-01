import { invalidInput } from "../../../../core/applicationError";
import type { Tx } from "../../../../core/db";
import type { JobQueue } from "../../../../core/jobs";
import { appendRecordHistory } from "../../../../core/records";
import type { SecretBox } from "../../../../core/secrets";
import type { SecurityContext } from "../../../../core/security";
import { employeeRepository, inviteRepository } from "../../db";
import {
  canBeInvited,
  createInviteToken,
  type InviteDelivery,
  inviteExpiry,
  inviteLink,
  noteHasLink,
} from "../../domain";
import { employeeNotFound } from "../useCases/employeeNotFound";
import type { SentInvite } from "./employeeInviteService";

/**
 * How invites go now: by email while mail is chosen and `requested` asks for nothing else, else
 * as links. Refuses a note with a link when Broccoli's relay would carry it.
 */
export async function chooseDelivery(
  readMailer: () => Promise<{ sendsThroughBroccoli: boolean } | null>,
  requested: InviteDelivery | null | undefined,
  note: string | null,
): Promise<InviteDelivery> {
  const mailer = requested === "copied_by_owner" ? null : await readMailer();
  if (mailer?.sendsThroughBroccoli && note && noteHasLink(note)) {
    throw invalidInput([{ field: "note", code: "has_link" }]);
  }
  return mailer ? "sent_by_email" : "copied_by_owner";
}

/**
 * Makes one invite for each of these people who can be invited, replacing any open one, joining
 * `tx`; queues its email or returns its link. Refuses with NOT_FOUND for an id of nobody.
 */
export async function createInvites(
  ctx: SecurityContext,
  tx: Tx,
  { jobs, secretBox }: { jobs: JobQueue; secretBox: SecretBox },
  {
    employeeIds,
    profiles,
    note,
    invitedByUserId,
    delivery,
    linkOrigin,
  }: {
    employeeIds: string[];
    /** None keeps an open invite's. */
    profiles: "ADMIN"[] | null;
    note: string | null;
    invitedByUserId: string | null;
    delivery: InviteDelivery;
    linkOrigin: string;
  },
): Promise<SentInvite[]> {
  const now = new Date();
  // Sends, cancels and accepts of one person take turns.
  await employeeRepository(tx).lockByIds(employeeIds);
  const [invitees, open] = await Promise.all([
    inviteRepository(tx).findInvitees(employeeIds),
    inviteRepository(tx).findOpen(employeeIds),
  ]);
  if (invitees.length < employeeIds.length) {
    throw employeeNotFound();
  }
  const openOf = new Map(open.map((invite) => [invite.employeeId, invite]));
  const invited = invitees.filter(canBeInvited).map(({ employee }) => employee);
  // Whole, for the answer, which returns them.
  const employeesById = new Map(
    (await employeeRepository(tx).findByIds(invited.map(({ id }) => id))).map((employee) => [
      employee.id,
      employee,
    ]),
  );
  const made: SentInvite[] = [];
  for (const employee of invited) {
    const replaced = openOf.get(employee.id);
    const { token, tokenHash } = createInviteToken();
    const invite = await inviteRepository(tx).replace(
      {
        employeeId: employee.id,
        email: employee.email.toLowerCase(),
        tokenHash,
        // A new link without profiles keeps the ones its invite had.
        profiles: profiles ?? replaced?.profiles ?? [],
        note,
        invitedByUserId,
        expiresAt: inviteExpiry(now),
      },
      now,
    );
    const historyLine = await appendSignInLine(ctx, tx, employee.id, {
      kind: "INVITE_SENT",
      ref: invite.id,
      from: replaced ? "INVITED" : "NOT_INVITED",
      to: "INVITED",
    });
    if (delivery === "sent_by_email") {
      await jobs.send(tx, "employees.sendInvite", {
        inviteId: invite.id,
        encryptedToken: secretBox.encrypt(token),
      });
    }
    made.push({
      employee: employeesById.get(employee.id)!,
      expiresAt: invite.expiresAt,
      delivery,
      link: delivery === "copied_by_owner" ? inviteLink(linkOrigin, token) : null,
      historyLine,
    });
  }
  return made;
}

/** Writes the line that changes the person's `signIn` field. */
export async function appendSignInLine(
  ctx: SecurityContext,
  tx: Tx,
  employeeId: string,
  {
    kind,
    ref,
    from,
    to,
  }: {
    kind: "INVITE_SENT" | "INVITE_CANCELLED" | "INVITE_ACCEPTED";
    ref: string;
    from: string;
    to: string;
  },
) {
  const [line] = await appendRecordHistory(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    cause: { kind, ref },
    records: [
      { recordId: employeeId, changes: [{ field: "signIn", oldValue: from, newValue: to }] },
    ],
  });
  return line!;
}
