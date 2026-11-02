import { mutationPayload, type Resolvers, type ResolversTypes } from "../../../core/graphql";
import type {
  EmployeeInviteService,
  EmployeeManagerService,
  EmployeePermissionService,
  EmployeeReadService,
  EmployeeService,
} from "../app";
import { avatarUrl } from "../http";
import { employeeLoaders } from "./loaders";

export function createResolvers(
  services: EmployeeService &
    EmployeeReadService &
    EmployeeManagerService &
    EmployeePermissionService,
  invites: EmployeeInviteService,
): Resolvers {
  const loaders = employeeLoaders(services, invites);
  return {
    Query: {
      employee: (_parent, { id }, context) => services.readEmployee(context.getActor(), id),
      employees: (_parent, { first, after, orderBy, filter }, context) =>
        services.listEmployees(context.getActor(), {
          first: first ?? undefined,
          after,
          orderBy,
          filter,
        }),
    },
    Mutation: {
      employee: () => ({}),
    },
    EmployeeMutations: {
      create: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeCreatePayload"]>(
          async () => ({ employee: await services.createEmployee(context.getActor(), input) }),
          ["INVALID_INPUT"],
        ),
      update: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeUpdatePayload"]>(
          () => services.updateEmployee(context.getActor(), input),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      delete: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeDeletePayload"]>(
          () => services.deleteEmployee(context.getActor(), input),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      setManagers: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeSetManagersPayload"]>(
          () =>
            services.setManagers(context.getActor(), {
              employeeIds: input.employeeIds,
              managerId: input.managerId ?? null,
            }),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      setPermissionProfiles: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["EmployeeUpdatePayload"]>(
          () => services.setPermissionProfiles(context.getActor(), input),
          ["INVALID_INPUT", "NOT_FOUND"],
        ),
      invite: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["InviteSendPayload"]>(async () => {
          const sent = await invites.send(
            context.getActor(),
            { ...input, delivery: input.delivery && DELIVERY_INPUTS[input.delivery] },
            await context.publicOrigin(),
          );
          return {
            invites: sent.map((invite) => ({ ...invite, delivery: DELIVERIES[invite.delivery] })),
          };
        }, ["INVALID_INPUT", "NOT_FOUND", "CONFLICT"]),
      cancelInvite: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["InviteCancelPayload"]>(
          () => invites.cancel(context.getActor(), input),
          ["NOT_FOUND"],
        ),
    },
    Setup: {
      inviteDelivery: async (_setup, _args, { security }) =>
        security?.can("MANAGE_WORKSPACE") ? DELIVERIES[await invites.delivery(security)] : null,
    },
    User: {
      employee: (_user, _args, context) => services.readMyEmployee(context.getActor()),
    },
    Employee: {
      avatarUrl: ({ avatarFileId }) => avatarFileId && avatarUrl(avatarFileId),
      startDate: (employee, _args, context) => loaders(context).startDate.load(employee.id),
      managerId: async (employee, _args, context) =>
        (await loaders(context).manager.load(employee.id))?.id ?? null,
      manager: (employee, _args, context) => loaders(context).manager.load(employee.id),
      permissionProfiles: (employee, _args, context) =>
        loaders(context).permissionProfiles.load(employee.id),
      signInStatus: async (employee, _args, context) => {
        if (!context.getActor().can("MANAGE_WORKSPACE")) {
          return null;
        }
        const status = await loaders(context).signInStatus.load(employee.id);
        return status && { ...status, state: SIGN_IN_STATES[status.state] };
      },
      // shortcut: one query per employee; batch it when a list selects history.
      history: (employee, { first, after }, context) =>
        services.readEmployeeHistory(context.getActor(), employee.id, {
          first: first ?? undefined,
          after,
        }),
    },
  };
}

const DELIVERIES = { sent_by_email: "SENT_BY_EMAIL", copied_by_owner: "COPIED_BY_OWNER" } as const;
const DELIVERY_INPUTS = {
  SENT_BY_EMAIL: "sent_by_email",
  COPIED_BY_OWNER: "copied_by_owner",
} as const;
const SIGN_IN_STATES = {
  not_invited: "NOT_INVITED",
  pending: "PENDING",
  joined: "JOINED",
} as const;
