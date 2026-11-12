import fc from "fast-check";

import {
  allowanceSnapshot,
  calendarDate,
  employeeServices,
  expect,
  giveTermsPolicies,
  ownTimeOffRulesService,
  OWNER,
  readTermsPolicies,
  test,
  timeOffService,
} from "#test/support";

import { ApplicationError } from "../../../core/applicationError";
import type { Orm } from "../../../core/db";
import { addDays, type CalendarDate } from "../../../utils";
import type { TimeOffRules } from "../domain";
import type { OwnRulesInput, OwnTimeOffRulesService } from "./ownTimeOffRulesService";
import type { PersonTimeOff } from "./readPersonTimeOff";

test("keeps own rules consistent with accepted dated changes and leaves refusals unchanged", async ({
  orm,
  seed,
  transact,
}) => {
  const termsId = await seed.defaultTermsId();
  await giveTermsPolicies(orm, transact, {
    termsId,
    policies: [{ key: "uk_20_days_plus_bank_holidays" }],
  });
  const [annual] = await readTermsPolicies(orm, termsId);
  const service = ownTimeOffRulesService(orm, { today: TODAY });

  await fc.assert(
    fc.asyncProperty(fc.array(operation(), { minLength: 1 }), async (operations) => {
      const employee = await seed.employee({ startDate: "2024-03-01" });
      const lane = { employeeId: employee.id, timeOffTypeId: annual!.timeOffTypeId };
      let model: Model = new Map();
      let before = await readState(orm, lane);
      const initial: Operation = { kind: "set", startDate: FIRST_DAY, rules: OWN_RULES };

      for (const [index, command] of [initial, ...operations].entries()) {
        const accepted = await applyOperation(service, lane, command);
        if (index === 0) expect(accepted).toBe(true);
        const after = await readState(orm, lane);
        if (accepted) model = applyToModel(model, command);
        else expect(after).toEqual(before);

        assertTimeline(after.versions, model);
        before = after;
      }
    }),
    { numRuns: 60, seed: 251202611, examples: [[roundTrip()], [countsBoundaries()]] },
  );
});

type Operation =
  | { kind: "set"; startDate: CalendarDate; rules: TimeOffRules }
  | { kind: "return" | "cancel"; startDate: CalendarDate };

// Adjacent identical own rules share one boundary; null marks a return to the terms' rules.
type Model = Map<CalendarDate, TimeOffRules | null>;

const TODAY = "2026-11-11";
const FIRST_DAY = calendarDate("2026-01-01");
const LAST_DAY = calendarDate("2027-12-31");
const TERMS_RULES: TimeOffRules = {
  balance: "balance_from_allowance",
  entitlementDays: 20,
  bankHolidays: "bank_holidays_on_top_of_allowance",
};
const OWN_RULES: TimeOffRules = { ...TERMS_RULES, entitlementDays: 25 };
const UNLIMITED: TimeOffRules = {
  balance: "unlimited_balance",
  entitlementDays: null,
  bankHolidays: null,
};

function operation(): fc.Arbitrary<Operation> {
  const startDate = fc.oneof(
    fc.constantFrom(
      FIRST_DAY,
      calendarDate(TODAY),
      calendarDate("2026-12-01"),
      calendarDate("2027-01-01"),
      calendarDate("2027-07-01"),
      LAST_DAY,
    ),
    fc.integer({ min: 0, max: 729 }).map((offset) => addDays(FIRST_DAY, offset)),
  );
  const rules = fc.constantFrom<TimeOffRules>(
    OWN_RULES,
    { ...OWN_RULES, entitlementDays: 30, bankHolidays: "bank_holidays_included_in_allowance" },
    { ...OWN_RULES, entitlementDays: 0 },
    UNLIMITED,
    { balance: "no_balance", entitlementDays: null, bankHolidays: null },
  );
  return fc.oneof(
    fc.record({ kind: fc.constant("set" as const), startDate, rules }),
    fc.record({ kind: fc.constant("return" as const), startDate }),
    fc.record({ kind: fc.constant("cancel" as const), startDate }),
  );
}

async function applyOperation(
  service: OwnTimeOffRulesService,
  lane: Omit<OwnRulesInput, "startDate">,
  command: Operation,
): Promise<boolean> {
  const input = { ...lane, startDate: command.startDate };
  try {
    if (command.kind === "set") {
      await service.setOwnRules(OWNER, { ...input, rules: command.rules });
    } else if (command.kind === "return") {
      await service.useTermsRules(OWNER, input);
    } else {
      await service.cancelOwnRulesChange(OWNER, input);
    }
    return true;
  } catch (error) {
    expect(error).toBeInstanceOf(ApplicationError);
    return false;
  }
}

async function readState(orm: Orm, lane: Omit<OwnRulesInput, "startDate">) {
  const [people, allowances, history] = await Promise.all([
    timeOffService(orm, { today: TODAY }).readPersonTimeOff(OWNER, {
      employeeIds: [lane.employeeId],
      from: FIRST_DAY,
    }),
    allowanceSnapshot(orm, lane.employeeId),
    employeeServices(orm).readEmployeeHistory(OWNER, lane.employeeId, { first: 10000 }),
  ]);
  const type = people
    .get(lane.employeeId)!
    .find(({ timeOffType }) => timeOffType.id === lane.timeOffTypeId)!;
  return { versions: type.versions, allowances, history };
}

function applyToModel(model: Model, command: Operation): Model {
  const next = new Map(model);
  if (command.kind === "cancel") {
    next.delete(command.startDate);
  } else {
    if (command.kind === "return") {
      for (const date of next.keys()) if (date >= command.startDate) next.delete(date);
    }
    next.set(command.startDate, command.kind === "set" ? command.rules : null);
  }

  const ordered: Model = new Map();
  let previous: TimeOffRules | null = null;
  for (const [date, rules] of [...next].toSorted(([a], [b]) => a.localeCompare(b))) {
    if (
      rules !== null &&
      previous !== null &&
      rules.balance === previous.balance &&
      rules.entitlementDays === previous.entitlementDays &&
      rules.bankHolidays === previous.bankHolidays
    ) {
      continue;
    }
    // Removing the first own stretch also removes its return; there is nothing left to return from.
    if (rules !== null || previous !== null) ordered.set(date, rules);
    previous = rules;
  }
  return ordered;
}

function assertTimeline(versions: PersonTimeOff["versions"], model: Model) {
  expect(versions.length).toBeGreaterThan(0);
  expect(versions[0]!.startDate).toBe(FIRST_DAY);
  expect(versions.at(-1)!.endDate).toBeNull();
  for (const [index, row] of versions.entries()) {
    expect(row.startDate <= LAST_DAY).toBe(true);
    if (row.endDate !== null) expect(row.endDate >= row.startDate).toBe(true);
    const previous = versions[index - 1];
    if (!previous) continue;
    expect(previous.endDate).not.toBeNull();
    expect(previous.endDate! < row.startDate).toBe(true);
    if (previous.version.balance !== row.version.balance) {
      expect(row.startDate.endsWith("-01-01")).toBe(true);
    }
  }

  const actual = [];
  const expected = [];
  let own: TimeOffRules | null = null;
  for (let date = FIRST_DAY; date <= LAST_DAY; date = addDays(date, 1)) {
    if (model.has(date)) own = model.get(date)!;
    const row = versions.find(
      (version) => version.startDate <= date && (!version.endDate || date <= version.endDate),
    );
    const yearly = row?.version.rules.find((rule) => rule.kind === "yearly_entitlement");
    actual.push({
      source: row?.source,
      balance: row?.version.balance,
      entitlementDays: yearly?.entitlementDays ?? null,
      bankHolidays: row?.version.bankHolidays,
    });
    expected.push({ source: own ? "their_own" : "from_their_terms", ...(own ?? TERMS_RULES) });
  }
  expect(actual).toEqual(expected);
}

function roundTrip(): Operation[] {
  return [
    { kind: "set", startDate: FIRST_DAY, rules: OWN_RULES },
    { kind: "return", startDate: calendarDate("2026-12-01") },
    { kind: "set", startDate: calendarDate("2027-01-01"), rules: OWN_RULES },
    { kind: "cancel", startDate: calendarDate("2026-12-01") },
    { kind: "cancel", startDate: calendarDate("2027-01-01") },
    { kind: "cancel", startDate: calendarDate(TODAY) },
    { kind: "return", startDate: FIRST_DAY },
  ];
}

function countsBoundaries(): Operation[] {
  return [
    { kind: "set", startDate: calendarDate("2027-01-01"), rules: UNLIMITED },
    { kind: "set", startDate: calendarDate("2027-07-01"), rules: UNLIMITED },
    { kind: "cancel", startDate: calendarDate("2027-01-01") },
    { kind: "cancel", startDate: calendarDate("2027-07-01") },
    { kind: "return", startDate: calendarDate("2027-07-01") },
    { kind: "cancel", startDate: calendarDate("2027-01-01") },
  ];
}
