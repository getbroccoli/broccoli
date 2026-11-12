import type { Orm } from "../../src/core/db";
import { instanceRepository } from "../../src/core/instance/db";
import { inviteRepository } from "../../src/modules/employees/db";
import {
  employeeServices,
  employeeInviteService,
  companyService,
  taskService,
  mailSettings,
  importServices,
  systemService,
} from "./services";
import { recordCloneService } from "./recordCloneService";
import { recordHistory } from "./statelessServices";
import { signedIn } from "./signedIn";
import { OWNER } from "./testSecurityContext";
import { TEST_SECRET_BOX } from "./testSecretBox";
import type { TestSeed } from "./testSeed";
import { termsService } from "./termsService";
import { timeOffService } from "./timeOffService";

export interface StoredTextProbe {
  act: () => Promise<unknown>;
  read: () => Promise<string | null>;
  expected: string | null;
}

/** Each probe uses an ordinary public write and reads the persisted value back separately. */
export async function storedTextProbe(
  orm: Orm,
  seed: TestSeed,
  entry: string,
  value: string,
): Promise<StoredTextProbe> {
  const expected = value.trim();
  if (entry.startsWith("terms.")) {
    const terms = termsService(orm);
    const sourceId = await seed.terms();
    let id = sourceId;
    return {
      expected,
      act: async () => {
        if (entry === "terms.create")
          id = (await terms.createTerms(OWNER, { name: value, bankHolidayCalendar: "scotland" }))
            .id;
        else if (entry === "terms.update") await terms.updateTerms(OWNER, { id, name: value });
        else
          id = (
            await recordCloneService(orm, { today: "2026-06-01" }).cloneRecord(OWNER, {
              recordType: "terms",
              id,
              name: value,
            })
          ).id;
      },
      read: async () => (await terms.readTerms(OWNER, id))!.name,
    };
  }
  if (entry.startsWith("type.")) {
    const service = timeOffService(orm);
    const identity = {
      name: value,
      private: false,
      icon: "sun" as const,
      colour: "green" as const,
      defaultRules: { balance: "no_balance" },
    };
    let id = (await service.listTimeOffTypes(OWNER)).timeOffTypes.find(
      ({ timeOffType }) => timeOffType.typeKey === "other",
    )!.timeOffType.id;
    return {
      expected,
      act: async () => {
        id = (
          entry === "type.create"
            ? await service.createType(OWNER, identity)
            : await service.changeType(OWNER, { ...identity, id })
        ).id;
      },
      read: async () =>
        (await service.listTimeOffTypes(OWNER)).timeOffTypes.find(
          ({ timeOffType }) => timeOffType.id === id,
        )!.timeOffType.name,
    };
  }
  if (entry.startsWith("employee.create.") || entry.startsWith("employee.update.")) {
    const field = entry.split(".")[2]!;
    const service = employeeServices(orm);
    const existing = await seed.employee();
    let id = existing.id;
    return {
      expected:
        field === "email"
          ? expected.toLowerCase()
          : field === "jobTitle"
            ? expected || null
            : expected,
      act: async () => {
        if (entry.startsWith("employee.create.")) {
          const employee = await service.createEmployee(OWNER, {
            firstName: "Avery",
            lastName: "Stone",
            email: `new-${existing.id}@example.com`,
            [field]: value,
          });
          id = employee!.id;
        } else await service.updateEmployee(OWNER, { id, [field]: value });
      },
      read: async () => {
        const employee = (await service.readEmployee(OWNER, id))!;
        return {
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          jobTitle: employee.jobTitle,
        }[field]!;
      },
    };
  }
  if (entry.startsWith("employee.reason.")) {
    const service = employeeServices(orm);
    const unique = await seed.employee();
    const user = await seed.user({ email: `user-${unique.id}@example.com` });
    const employee = await seed.employee({ userId: user.id });
    return {
      expected: expected || null,
      act: async () => {
        if (entry.endsWith("update"))
          await service.updateEmployee(OWNER, {
            id: employee.id,
            jobTitle: "Changed",
            changeReason: value,
          });
        else if (entry.endsWith("delete"))
          await service.deleteEmployee(OWNER, { id: employee.id, changeReason: value });
        else
          await service.setPermissionProfiles(OWNER, {
            id: employee.id,
            profiles: ["ADMIN"],
            changeReason: value,
          });
      },
      read: async () =>
        (await recordHistory.read(orm, "employee", employee.id, { first: 1 })).edges[0]!.node
          .reason,
    };
  }
  if (entry.startsWith("location.")) {
    const service = employeeServices(orm);
    let id = (await seed.location(`Location ${await seed.terms()}`)).id;
    return {
      expected,
      act: async () => {
        id = (
          entry === "location.create"
            ? await service.createLocation(OWNER, { name: value })
            : await service.updateLocation(OWNER, { id, name: value })
        ).id;
      },
      read: async () =>
        (await service.listLocations(OWNER)).find((location) => location.id === id)!.name,
    };
  }
  if (entry === "company.name") {
    const service = companyService(orm);
    return {
      expected,
      act: () => service.update(OWNER, { name: value }),
      read: async () => (await service.getCompany(OWNER)).name,
    };
  }
  if (entry === "task.cancelReason") {
    const asker = await seed.employee();
    const holder = await seed.employee();
    const task = await seed.task({
      requestedByEmployeeId: asker.id,
      assigneeEmployeeId: holder.id,
    });
    const ctx = signedIn(orm, { employeeId: asker.id, profiles: ["EMPLOYEE"] });
    const service = taskService(orm);
    return {
      expected,
      act: () => service.cancel(ctx, task.id, value),
      read: async () => (await service.readTask(ctx, task.id)).cancelReason,
    };
  }
  if (entry === "invite.note") {
    const employee = await seed.employee();
    const owner = await seed.owner({ email: `owner-${employee.id}@example.com` });
    return {
      expected: expected || null,
      act: () =>
        employeeInviteService(orm).send(
          owner,
          { employeeIds: [employee.id], note: value, delivery: "copied_by_owner" },
          "https://example.com",
        ),
      read: async () => (await inviteRepository(orm).findOpen([employee.id]))[0]!.note,
    };
  }
  if (entry === "setup.inviteNote") {
    const unique = await seed.terms();
    await seed.assignment({ instanceCredential: "test-instance-credential" });
    const owner = await seed.owner({ email: `owner-${unique}@example.com` });
    const system = systemService(orm);
    await seed.setupStep("done");
    await system.resetSetup(owner);
    await seed.setupStep("import");
    const source = await seed.importSource();
    await seed.importEmployees(source.id, [
      { firstName: "Avery", lastName: "Stone", email: `${unique}@example.com` },
    ]);
    const imports = importServices(orm);
    await imports.approveImport(owner, (await imports.reads.readReview(owner)).version);
    let ids: string[] = [];
    return {
      expected: expected || null,
      act: async () => {
        const invites = await system.completeSetup(owner, {
          ownerEmployeeKey: null,
          inviteAudience: "everyone",
          inviteNote: value,
          timeOff: null,
          linkOrigin: "https://example.com",
        });
        ids = invites.map(({ employeeId }) => employeeId);
      },
      read: async () => (await inviteRepository(orm).findOpen(ids))[0]!.note,
    };
  }
  const service = mailSettings(orm);
  await service.save(OWNER, { source: "no_email" }, "https://example.com");
  return {
    expected,
    act: () =>
      service.save(
        OWNER,
        {
          source: "resend_api",
          from: entry === "mail.from" ? value : "people@example.com",
          secret: entry === "mail.secret" ? value : "test-key",
        },
        "https://example.com",
      ),
    read: async () => {
      if (entry === "mail.from") return (await service.read(OWNER))!.from;
      const saved = await instanceRepository(orm).readMailSender();
      return TEST_SECRET_BOX.decrypt(saved.encryptedSecret!);
    },
  };
}
