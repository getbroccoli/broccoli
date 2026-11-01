import { ApplicationError } from "../../../../core/applicationError";
import type { Orm, Transact, Tx } from "../../../../core/db";
import { type MailSettings, readInstance } from "../../../../core/instance";
import type { JobHandlers, JobQueue } from "../../../../core/jobs";
import type { Logger } from "../../../../core/logger";
import type { HistoryLine } from "../../../../core/records";
import type { SecretBox } from "../../../../core/secrets";
import {
  permissionProfileRepository,
  type PermissionProfile,
  PrincipalSecurityContext,
  type SecurityContext,
} from "../../../../core/security";
import { parseUuid } from "../../../../utils";
import { employeeRepository, inviteRepository } from "../../db";
import {
  canAccept,
  signInStatus,
  type Employee,
  hashInviteToken,
  type InviteDelivery,
  parseInviteInput,
  parseInviteNote,
  type SignInStatus,
} from "../../domain";
import { employeeDirectory } from "../employeeDirectory";
import { employeeNotFound } from "../useCases/employeeNotFound";
import { appendSignInLine, chooseDelivery, createInvites } from "./createInvites";
import { sendInviteJob } from "./sendInviteJob";

/** An admin's invites to sign in, from sending them to the person joining. */
export interface EmployeeInviteService {
  /**
   * Invites people: one new invite each, replacing any open one, by email while mail is chosen
   * and `delivery` asks for nothing else, else as links in the answer. Skips people who joined,
   * whose email has an account, or who are demo data.
   */
  send(ctx: SecurityContext, input: InviteInput, linkOrigin: string): Promise<SentInvite[]>;
  /**
   * Invites people as setup finishes, joining its `tx`: as `send` does, with no profile beside
   * `EMPLOYEE`, without the cap on how many, and nothing for no one.
   */
  sendAtSetup(
    ctx: SecurityContext,
    tx: Tx,
    input: { employeeIds: string[]; note: string | null; invitedByUserId: string },
    linkOrigin: string,
  ): Promise<SentInvite[]>;
  /** Cancels the person's open invite; refuses with NOT_FOUND without one. */
  cancel(
    ctx: SecurityContext,
    input: { employeeId: string },
  ): Promise<{ employee: Employee; historyLine: HistoryLine }>;
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
  ): Promise<{ joined: Joined; inviteId: string; employeeId: string } | null>;
  jobs: JobHandlers;
}

export interface InviteInput {
  employeeIds: readonly string[];
  /** Beside `EMPLOYEE`, which everyone has; `OWNER` is refused. None keeps an open invite's. */
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
  /** The line the invite added to the person's history. */
  historyLine: HistoryLine;
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
  readCompany,
}: {
  orm: Orm;
  transact: Transact;
  logger: Logger;
  jobs: JobQueue;
  secretBox: SecretBox;
  mailSettings: MailSettings;
  /** The company, whose name the invite and its page show. */
  readCompany: (ctx: SecurityContext) => Promise<{ name: string | null }>;
}): EmployeeInviteService {
  // The job and the public invite page run without a user.
  const system = PrincipalSecurityContext.system();
  const invites = inviteRepository(orm);
  const readMailer = () => mailSettings.readMailer(system);
  const readCompanyName = async () => (await readCompany(system)).name ?? "";
  const newInvite = { jobs, secretBox };

  return {
    send: async (ctx, input, linkOrigin) => {
      ctx.require("MANAGE_WORKSPACE");
      const { employeeIds, profiles, note } = parseInviteInput(input);
      // A demo's owner is provisional; an account they invited would outlive the demo.
      if ((await readInstance(orm)).demoExpiresAt) {
        throw new ApplicationError("CONFLICT", "Invites start once the demo ends.");
      }
      const delivery = await chooseDelivery(readMailer, input.delivery, note);
      const sent = await transact((tx) =>
        createInvites(ctx, tx, newInvite, {
          employeeIds,
          profiles,
          note,
          invitedByUserId: ctx.user?.userId ?? null,
          delivery,
          linkOrigin,
        }),
      );
      logger.info(
        { employeeIds: sent.map(({ employee }) => employee.id), delivery },
        "Invites created",
      );
      return sent;
    },

    sendAtSetup: async (ctx, tx, { employeeIds, note, invitedByUserId }, linkOrigin) => {
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      const trimmedNote = parseInviteNote(note);
      if (employeeIds.length === 0) {
        return [];
      }
      return createInvites(ctx, tx, newInvite, {
        employeeIds,
        profiles: [],
        note: trimmedNote,
        invitedByUserId,
        delivery: await chooseDelivery(readMailer, null, trimmedNote),
        linkOrigin,
      });
    },

    cancel: async (ctx, { employeeId: id }) => {
      ctx.require("MANAGE_WORKSPACE");
      const employeeId = parseUuid(id);
      if (!employeeId) {
        throw employeeNotFound();
      }
      const { employee, historyLine, inviteId } = await transact(async (tx) => {
        await employeeRepository(tx).lockByIds([employeeId]);
        const cancelled = await inviteRepository(tx).cancelOpen(employeeId, new Date());
        const employee = cancelled && (await employeeRepository(tx).findById(employeeId));
        if (!cancelled || !employee) {
          throw new ApplicationError("NOT_FOUND", "The person has no open invite.");
        }
        const historyLine = await appendSignInLine(ctx, tx, employeeId, {
          kind: "INVITE_CANCELLED",
          ref: cancelled.id,
          from: "INVITED",
          to: "NOT_INVITED",
        });
        return { employee, historyLine, inviteId: cancelled.id };
      });
      logger.info({ inviteId, employeeId }, "Invite cancelled");
      return { employee, historyLine };
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
      // The setup holder previews setup's invites before the owner exists.
      ctx.requireSetupAccess("MANAGE_WORKSPACE");
      return (await readMailer()) ? "sent_by_email" : "copied_by_owner";
    },

    lookUp: async (token) => {
      const invite = await invites.findOpenByTokenHash(hashInviteToken(token));
      if (!invite) {
        return null;
      }
      const [[invitee], inviter, companyName] = await Promise.all([
        invites.findInvitees([invite.employeeId]),
        invite.invitedByUserId ? invites.findInviter(invite.invitedByUserId) : null,
        readCompanyName(),
      ]);
      if (!invitee || !canAccept(invite, invitee)) {
        return null;
      }
      return {
        companyName,
        inviterFirstName: inviter?.name?.split(" ")[0] ?? null,
        firstName: invitee.employee.firstName,
        email: invite.email,
        expiresAt: invite.expiresAt,
      };
    },

    accept: async (tx, token, createUser) => {
      const tokenHash = hashInviteToken(token);
      const found = await inviteRepository(tx).findOpenByTokenHash(tokenHash);
      if (!found) {
        return null;
      }
      // In the order a send takes them, the person first, so the two cannot deadlock.
      await employeeRepository(tx).lockByIds([found.employeeId]);
      const invite = await inviteRepository(tx).lockOpenByTokenHash(tokenHash);
      const [invitee] = await inviteRepository(tx).findInvitees([found.employeeId]);
      if (!invite || !invitee || !canAccept(invite, invitee)) {
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
      return { joined, inviteId: invite.id, employeeId: employee.id };
    },

    jobs: sendInviteJob({ orm, logger, secretBox, readMailer, readCompanyName }),
  };
}
