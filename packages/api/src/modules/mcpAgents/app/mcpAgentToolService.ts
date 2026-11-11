import type { ModuleDependencies } from "../../../core/moduleManifest";
import type { PermissionProfile, SecurityContext } from "../../../core/security";
import { createEmployeeManagerService, createEmployeeReadService } from "../../employees";

/** What a person's own agent reads in Broccoli, as that person, through the MCP server. */
export interface McpAgentToolService {
  /** Who the caller is: their email, permission profiles, employee and manager today. */
  whoAmI: (ctx: SecurityContext) => Promise<WhoAmI>;
  /** The people the caller may read, sorted by name, a page at a time, optionally searched. */
  findPeople: (
    ctx: SecurityContext,
    input: { search?: string; after?: string },
  ) => Promise<PeoplePage>;
}

export interface WhoAmI {
  email: string;
  permissionProfiles: PermissionProfile[];
  employee: Person | null;
  manager: Person | null;
}

export interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
}

export interface PeoplePage {
  people: Person[];
  /** Pass as `after` for the next page; null on the last one. */
  nextCursor: string | null;
}

/** A page an agent can show or reason over in one go. */
const PEOPLE_PER_PAGE = 25;

export function createMcpAgentToolService(
  dependencies: Pick<ModuleDependencies, "orm" | "transact" | "logger">,
): McpAgentToolService {
  const employees = createEmployeeReadService(dependencies);
  const managers = createEmployeeManagerService(dependencies);
  return {
    async whoAmI(ctx) {
      const user = ctx.user!;
      const employee = await employees.readMyEmployee(ctx);
      const manager = employee
        ? (await managers.readManagers(ctx, [employee.id])).get(employee.id)
        : undefined;
      return {
        email: user.email,
        permissionProfiles: [...user.permissionProfiles],
        employee: employee && personOf(employee),
        manager: manager ? personOf(manager) : null,
      };
    },
    async findPeople(ctx, { search, after }) {
      const page = await employees.listEmployees(ctx, {
        first: PEOPLE_PER_PAGE,
        after,
        filter: { search },
      });
      return {
        people: page.edges.map(({ node }) => personOf(node)),
        nextCursor: page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null,
      };
    },
  };
}

function personOf({ id, firstName, lastName, email, jobTitle }: Person): Person {
  return { id, firstName, lastName, email, jobTitle };
}
