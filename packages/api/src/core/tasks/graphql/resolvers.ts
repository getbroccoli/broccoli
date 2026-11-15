import { ApplicationError } from "../../applicationError";
import { mutationPayload, toEnum, type Resolvers, type ResolversTypes } from "../../graphql";
import type { TaskService } from "../app";

const EXPECTED_ERRORS = ["INVALID_INPUT", "NOT_FOUND", "CONFLICT"] as const;

export function createResolvers(tasks: TaskService): Resolvers {
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
      delete: (_parent, { input }, context) =>
        mutationPayload<ResolversTypes["TaskDeletePayload"]>(
          () => tasks.deleteTask(context.getActor(), input.id),
          EXPECTED_ERRORS,
        ),
    },
    Task: {
      type: ({ type }) => toEnum(type) as ResolversTypes["TaskType"],
      status: ({ status }) => toEnum(status),
      history: ({ id }, { first, after }, context) =>
        tasks.readTaskHistory(context.getActor(), id, { first: first ?? undefined, after }),
    },
  };
}
