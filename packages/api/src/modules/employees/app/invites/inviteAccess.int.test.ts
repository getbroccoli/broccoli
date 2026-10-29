import { employeeDirectory, employeeInviteService, EMPLOYEE, expect, test } from "#test/support";

import { PrincipalSecurityContext, type SecurityContext } from "../../../../core/security";
import type { EmployeeInviteService } from "./employeeInviteService";

for (const profile of ["ADMIN", "OWNER"] as const) {
  test.for(["send", "cancel", "readStatuses", "delivery"] as const)(
    `${profile} may call %s`,
    async (operation, { orm, seed }) => {
      const owner = await seed.owner();
      const ctx = PrincipalSecurityContext.user(
        {
          ...owner.user!,
          isOwner: profile === "OWNER",
          permissionProfiles: ["EMPLOYEE", profile],
        },
        employeeDirectory(orm),
      );
      const employee = await seed.employee();
      const service = employeeInviteService(orm);
      await service.send(owner, { employeeIds: [employee.id] }, "https://copy.example.com");

      await expect(operations[operation](service, ctx, employee.id)).resolves.toBeDefined();
    },
  );
}

test.for(["send", "cancel", "readStatuses", "delivery"] as const)(
  "EMPLOYEE is refused %s",
  async (operation, { orm, seed }) => {
    const owner = await seed.owner();
    const employee = await seed.employee();
    const service = employeeInviteService(orm);
    await service.send(owner, { employeeIds: [employee.id] }, "https://copy.example.com");

    await expect(operations[operation](service, EMPLOYEE, employee.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  },
);

const operations = {
  send: (service, ctx, id) => service.send(ctx, { employeeIds: [id] }, "https://copy.example.com"),
  cancel: (service, ctx, id) => service.cancel(ctx, { employeeId: id }),
  readStatuses: (service, ctx, id) => service.readStatuses(ctx, [id]),
  delivery: (service, ctx) => service.delivery(ctx),
} satisfies Record<
  string,
  (service: EmployeeInviteService, ctx: SecurityContext, id: string) => Promise<unknown>
>;
