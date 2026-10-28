import { ApplicationError, invalidInput } from "../../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../../core/db";
import type { MailSettings } from "../../../../core/instance";
import type { JobHandlers, JobQueue } from "../../../../core/jobs";
import type { Logger } from "../../../../core/logger";
import { appendRecordHistory } from "../../../../core/records";
import type { SecretBox } from "../../../../core/secrets";
import {
  parseGivenProfiles,
  permissionProfileRepository,
  type PermissionProfile,
  PrincipalSecurityContext,
  type SecurityContext,
} from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import { employeeRepository, inviteRepository } from "../../db";
import {
  canBeInvited,
  createInviteToken,
  isExpired,
  signInStatus,
  type Employee,
  hashInviteToken,
  type InviteDelivery,
  inviteExpiry,
  inviteLink,
  MAX_INVITEES,
  NOTE_MAX_LENGTH,
  type SignInStatus,
} from "../../domain";
import { employeeDirectory } from "../employeeDirectory";
import { employeeNotFound } from "../useCases/employeeNotFound";
import { sendInviteJob } from "./inviteEmail";

/** An admin's invites to sign in, from sending them to the person joining. */
export interface EmployeeInviteService {
  /**
   * Invites people: one new invite each, replacing any open one, by email while mail is chosen
   * and `delivery` asks for nothing else, else as links in the answer. Skips people who joined,
   * whose email has an account, or who are demo data.
   */
  send(ctx: SecurityContext, input: InviteInput, linkOrigin: string): Promise<SentInvite[]>;
  /** Cancels the person's open invite; refuses with NOT_FOUND without one. */
  cancel(ctx: SecurityContext, input: { employeeId: string }): Promise<Employee>;
  /** Each person's sign-in state, by employee id; unknown ids are left out. */
  readStatuses(
    ctx: SecurityContext,
    employeeIds: readonly string[],
  ): Promise<Map<string, SignInStatus>>;
  /** How invites reach people now. */
  delivery(ctx: SecurityContext): Promise<InviteDelivery>;
  /** What the invite page shows for a token; null for one that does not open an invite. */
  lookUp(token: string): Promise<InviteDetails | null>;
  /**
   * Joins the person behind the token in `tx`, which Better Auth's writes join: `createUser` makes
   * their user, then they get the invite's profiles and their employee. Null for a token that does
   * not open an invite, such as one used a moment ago.
   */
  accept<Joined extends { user: { id: string } }>(
    tx: Tx,
    token: string,
    createUser: (account: { email: string; name: string }) => Promise<Joined>,
  ): Promise<Joined | null>;
  jobs: JobHandlers;
}

export interface InviteInput {
  employeeIds: readonly string[];
  /** Beside `EMPLOYEE`, which everyone has; `OWNER` is refused. */
  profiles?: readonly PermissionProfile[] | null;
  note?: string | null;
  /** `copied_by_owner` asks for links even while mail is chosen. */
  delivery?: InviteDelivery | null;
}

export interface SentInvite {
  employee: Employee;
  expiresAt: Date;
  delivery: InviteDelivery;
  /** The link to copy and send; only for `copied_by_owner`, and only here. */
  link: string | null;
}

export interface InviteDetails {
  companyName: string;
  inviterFirstName: string | null;
  firstName: string;
  email: string;
  expiresAt: Date;
}

export function createEmployeeInviteService({
  orm,
  transact,
  logger,
  jobs,
  secretBox,
  mailSettings,
  readCompanyName,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  jobs: JobQueue;
  secretBox: SecretBox;
  mailSettings: MailSettings;
  /** The company's name, which the invite and its page show. */
  readCompanyName: () => Promise<string>;
}): EmployeeInviteService {
  // The job and the public invite page run without a user.
  const system = PrincipalSecurityContext.system();
  const invites = inviteRepository(orm);
  const readMailer = () => mailSettings.readMailer(system);

  return {
    send: async (ctx, input, linkOrigin) => {
      ctx.require("MANAGE_WORKSPACE");
      const { employeeIds, profiles, note } = parseInviteInput(input);
      const mailer = input.delivery === "copied_by_owner" ? null : await readMailer();
      const delivery: InviteDelivery = mailer ? "sent_by_email" : "copied_by_owner";
      const now = new Date();
      const sent = await transact(async (tx) => {
        const invitees = await inviteRepository(tx).findInvitees(employeeIds);
        if (invitees.length < employeeIds.length) {
          throw employeeNotFound();
        }
        const made: SentInvite[] = [];
        for (const { employee } of invitees.filter(canBeInvited)) {
          const { token, tokenHash } = createInviteToken();
          const { invite, replacedOpen } = await inviteRepository(tx).replace(
            {
              employeeId: employee.id,
              email: employee.email.toLowerCase(),
              tokenHash,
              profiles,
              note,
              invitedByUserId: ctx.user?.userId ?? null,
              delivery,
              expiresAt: inviteExpiry(now),
            },
            now,
          );
          await appendSignInLine(ctx, tx, employee.id, {
            kind: "INVITE_SENT",
            ref: invite.id,
            from: replacedOpen ? "INVITED" : "NOT_INVITED",
            to: "INVITED",
          });
          if (delivery === "sent_by_email") {
            await jobs.send(tx, "employees.sendInvite", {
              inviteId: invite.id,
              encryptedToken: secretBox.encrypt(token),
            });
          }
          made.push({
            employee,
            expiresAt: invite.expiresAt,
            delivery,
            link: delivery === "copied_by_owner" ? inviteLink(linkOrigin, token) : null,
          });
        }
        return made;
      });
      logger.info(
        { employeeIds: sent.map(({ employee }) => employee.id), delivery },
        "Invites created",
      );
      return sent;
    },

    cancel: async (ctx, { employeeId: id }) => {
      ctx.require("MANAGE_WORKSPACE");
      const employeeId = parseUuid(id);
      if (!employeeId) {
        throw employeeNotFound();
      }
      const { employee, inviteId } = await transact(async (tx) => {
        const cancelled = await inviteRepository(tx).cancelOpen(employeeId, new Date());
        const employee = cancelled && (await employeeRepository(tx).findById(employeeId));
        if (!cancelled || !employee) {
          throw new ApplicationError("NOT_FOUND", "The person has no open invite.");
        }
        await appendSignInLine(ctx, tx, employeeId, {
          kind: "INVITE_CANCELLED",
          ref: cancelled.id,
          from: "INVITED",
          to: "NOT_INVITED",
        });
        return { employee, inviteId: cancelled.id };
      });
      logger.info({ inviteId, employeeId }, "Invite cancelled");
      return employee;
    },

    readStatuses: async (ctx, ids) => {
      ctx.require("MANAGE_WORKSPACE");
      const employeeIds = ids.flatMap((id) => parseUuid(id) ?? []);
      const [invitees, open] = await Promise.all([
        invites.findInvitees(employeeIds),
        invites.findOpen(employeeIds),
      ]);
      const openOf = new Map(open.map((invite) => [invite.employeeId, invite]));
      return new Map(
        invitees.map((invitee) => [
          invitee.employee.id,
          signInStatus(invitee, openOf.get(invitee.employee.id)),
        ]),
      );
    },

    delivery: async (ctx) => {
      ctx.require("MANAGE_WORKSPACE");
      return (await readMailer()) ? "sent_by_email" : "copied_by_owner";
    },

    lookUp: async (token) => {
      const invite = await invites.findOpenByTokenHash(hashInviteToken(token));
      if (!invite || isExpired(invite)) {
        return null;
      }
      const [[invitee], inviter, companyName] = await Promise.all([
        invites.findInvitees([invite.employeeId]),
        invite.invitedByUserId ? invites.findInviter(invite.invitedByUserId) : null,
        readCompanyName(),
      ]);
      if (!invitee || !canBeInvited(invitee)) {
        return null;
      }
      const { employee } = invitee;
      return {
        companyName,
        inviterFirstName: inviter?.name?.split(" ")[0] ?? null,
        firstName: employee.firstName,
        email: invite.email,
        expiresAt: invite.expiresAt,
      };
    },

    accept: async (tx, token, createUser) => {
      const invite = await inviteRepository(tx).lockOpenByTokenHash(hashInviteToken(token));
      if (!invite || isExpired(invite)) {
        return null;
      }
      const [invitee] = await inviteRepository(tx).findInvitees([invite.employeeId]);
      if (!invitee || !canBeInvited(invitee)) {
        return null;
      }
      const { employee } = invitee;
      const joined = await createUser({
        email: invite.email,
        name: `${employee.firstName} ${employee.lastName}`,
      });
      const userId = joined.user.id;
      await permissionProfileRepository(tx).replaceProfiles(userId, invite.profiles);
      await employeeRepository(tx).linkUser(employee.id, userId);
      await inviteRepository(tx).markAccepted(invite.id, new Date());
      // The new user writes their own line.
      const newUser = PrincipalSecurityContext.user(
        {
          userId,
          email: invite.email,
          isOwner: false,
          permissionProfiles: ["EMPLOYEE", ...invite.profiles],
          employeeId: employee.id,
        },
        employeeDirectory(orm),
      );
      await appendSignInLine(newUser, tx, employee.id, {
        kind: "INVITE_ACCEPTED",
        ref: invite.id,
        from: "INVITED",
        to: "JOINED",
      });
      logger.info({ inviteId: invite.id, employeeId: employee.id, userId }, "Invite accepted");
      return joined;
    },

    jobs: sendInviteJob({ orm, logger, secretBox, readMailer, readCompanyName }),
  };
}

function parseInviteInput({ employeeIds, profiles, note }: InviteInput) {
  const ids = [...new Set(employeeIds)];
  if (ids.length === 0) {
    throw invalidInput([{ field: "employeeIds", code: "required" }]);
  }
  if (ids.length > MAX_INVITEES) {
    throw invalidInput([{ field: "employeeIds", code: "too_many" }]);
  }
  const trimmedNote = note?.trim() || null;
  if (trimmedNote && trimmedNote.length > NOTE_MAX_LENGTH) {
    throw invalidInput([{ field: "note", code: "too_long" }]);
  }
  const parsedIds = ids.map(parseUuid);
  if (parsedIds.some((id) => id === null)) {
    throw employeeNotFound();
  }
  return {
    employeeIds: parsedIds as string[],
    profiles: parseGivenProfiles(profiles ?? []),
    note: trimmedNote,
  };
}

/** Writes the line that changes the person's `signIn` field. */
function appendSignInLine(
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
  return appendRecordHistory(ctx, tx, {
    recordType: "employee",
    operation: "UPDATED",
    cause: { kind, ref },
    records: [
      { recordId: employeeId, changes: [{ field: "signIn", oldValue: from, newValue: to }] },
    ],
  });
}
