import type { Orm, Transact } from "../../src/core/db";
import type { Connection, PageArgs } from "../../src/core/pagination";
import { createRecordHistoryReaderService } from "../../src/core/records";
import { termsRecordType } from "../../src/modules/employees";
import { calendarDate } from "./calendarDate";
import { employeeServices, importServices, taskService } from "./services";
import { signedIn } from "./signedIn";
import { termsService } from "./termsService";
import { OWNER } from "./testSecurityContext";
import type { TestSeed } from "./testSeed";

/** Non-empty lists and real history, so cursor tests reach the same use cases as every Connection field. */
export async function seedPagingBoundary({
  orm,
  seed,
  transact,
}: {
  orm: Orm;
  seed: TestSeed;
  transact: Transact;
}) {
  const employees = employeeServices(orm);
  const person = await seed.employee();
  await employees.updateEmployee(OWNER, { id: person.id, jobTitle: "Designer" });
  await employees.updateEmployee(OWNER, { id: person.id, jobTitle: "Engineer" });
  const terms = termsService(orm);
  const termsId = await seed.terms();
  await terms.updateTerms(OWNER, { id: termsId, name: `First ${termsId}` });
  await terms.updateTerms(OWNER, { id: termsId, name: `Second ${termsId}` });
  const ctx = signedIn(orm, { employeeId: person.id, profiles: ["OWNER"] });
  const tasks = taskService(orm);
  const task = await transact((tx) =>
    tasks.createTask(ctx, tx, {
      type: "manual_to_do",
      title: "Read the handbook",
      assigneeEmployeeId: person.id,
      askedByEmployeeId: person.id,
    }),
  );
  await tasks.markDone(ctx, task.id);
  const source = await seed.importSource();
  await seed.importEmployees(source.id, [
    { firstName: "Avery", lastName: "Stone", email: "avery@example.com" },
    { firstName: "Robin", lastName: "Reed", email: "robin@example.com" },
  ]);
  const imports = importServices(orm);
  const review = await imports.reads.readReview(OWNER);
  const history = createRecordHistoryReaderService(orm, {
    terms: termsRecordType(orm, () => calendarDate("2026-06-01")),
  });
  const connections = {
    "Query.employees": (args: PageArgs) => employees.listEmployees(OWNER, args),
    "Employee.history": (args: PageArgs) => employees.readEmployeeHistory(OWNER, person.id, args),
    "Terms.history": (args: PageArgs) => terms.readTermsHistory(OWNER, termsId, args),
    "Task.history": (args: PageArgs) => tasks.readTaskHistory(ctx, task.id, args),
    "Query.recordHistory(terms)": (args: PageArgs) =>
      history.readHistory(OWNER, "terms", termsId, args),
    "Import.employees": (args: PageArgs) => review.listEmployees(args),
    "ImportSource.records": (args: PageArgs) =>
      imports.reads.listEmployeeRecords(OWNER, { sourceId: source.id, ...args }),
  } satisfies Record<
    string,
    (args: PageArgs) => Connection<unknown> | Promise<Connection<unknown>>
  >;
  return { connections, employees, terms, termsId, person, source, imports, history };
}
