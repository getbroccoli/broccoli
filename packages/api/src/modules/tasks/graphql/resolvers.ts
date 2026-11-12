import DataLoader from "dataloader";

import { ApplicationError } from "../../../core/applicationError";
import {
  type GraphqlContext,
  mutationPayload,
  perRequest,
  toEnum,
  type Resolvers,
  type ResolversTypes,
} from "../../../core/graphql";
import type { EmployeeReadService } from "../../employees";
import type { TaskService } from "../app";

const EXPECTED_ERRORS = ["INVALID_INPUT", "NOT_FOUND", "CONFLICT"] as const;

export function createResolvers(
  tasks: TaskService,
  employees: Pick<EmployeeReadService, "readEmployees">,
): Resolvers {
  // The people a list of tasks names, read in one query with the caller's access.
  const loaders = perRequest((context) => ({
    employee: new DataLoader(async (ids: readonly string[]) => {
      const found = await employees.readEmployees(context.getActor(), ids);
      return ids.map((id) => found.get(id) ?? null);
    }),
  }));
  const loadEmployee = (context: GraphqlContext, id: string | null) =>
    id === null ? null : loaders(context).employee.load(id);
  return {
    Query: {
      myTasks: (_parent, _args, context) => tasks.listMyTasks(context.getActor()),
      task: async (_parent, { id }, context) => {
        try {
          return await tasks.readTask(context.getActor(), id);
        } catch (error) {
          if (error instanceof ApplicationError && error.code === "NOT_FOUND") return null;
          throw error;
        }
      },
    },
    Mutation: {
      tasks: () => ({}),
    },
    TasksMutations: {
      markDone: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TaskPayload"]>(
          () => tasks.markDone(context.getActor(), input.id),
          EXPECTED_ERRORS,
        ),
      reopen: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TaskPayload"]>(
          () => tasks.reopen(context.getActor(), input.id),
          EXPECTED_ERRORS,
        ),
      cancel: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TaskPayload"]>(
          () => tasks.cancel(context.getActor(), input.id, input.reason),
          EXPECTED_ERRORS,
        ),
    },
    Task: {
      type: ({ type }) => toEnum(type),
      status: ({ status }) => toEnum(status),
      // The assignee's deletion deletes the task, so the assignee is always there.
      assignee: async ({ assigneeEmployeeId }, _args, context) =>
        (await loadEmployee(context, assigneeEmployeeId))!,
      askedBy: ({ askedByEmployeeId }, _args, context) => loadEmployee(context, askedByEmployeeId),
      subject: ({ subjectEmployeeId }, _args, context) => loadEmployee(context, subjectEmployeeId),
      doneBy: ({ doneByEmployeeId }, _args, context) => loadEmployee(context, doneByEmployeeId),
      history: ({ id }, { first, after }, context) =>
        tasks.readTaskHistory(context.getActor(), id, { first: first ?? undefined, after }),
    },
  };
}
