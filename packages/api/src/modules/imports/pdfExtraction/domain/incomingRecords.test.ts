import { expect, it } from "vitest";

import { incomingRecords } from "./incomingRecords";
import { documentEvidence } from "./maskedEvidence";
import { selectedRows } from "./rowSelection";

it("keeps each person's external id when the model returns people in another order", () => {
  const { people, registry } = restoredPeople();
  const first = incomingRecords(people, registry);

  const reversed = incomingRecords(people.toReversed(), registry);

  expect(reversed.map(({ externalId }) => externalId)).toEqual(
    first.toReversed().map(({ externalId }) => externalId),
  );
});

it("gives two printed occurrences of the same name distinct external ids", () => {
  const { people, registry } = restoredPeople();

  const records = incomingRecords([people[0]!, people[2]!], registry);

  expect(records).toHaveLength(2);
  expect(records[0]!.externalId).not.toBe("");
  expect(records[1]!.externalId).not.toBe("");
  expect(records[0]!.externalId).not.toBe(records[1]!.externalId);
});

it("normalizes the restored source into import employee values", () => {
  const { people, registry } = restoredPeople();

  const [record] = incomingRecords([people[0]!], registry);

  expect(record!.values).toEqual({
    firstName: "Avery",
    lastName: "Stone",
    email: "avery@example.com",
    jobTitle: "Payroll Specialist",
    startDate: "2021-02-03",
  });
});

it("keeps the original printed values and their references in the raw record", () => {
  const { people, registry } = restoredPeople();
  const person = people[0]!;

  const [record] = incomingRecords([person], registry);

  const raw = JSON.stringify(record!.raw);
  for (const value of ["Stone, Avery", "AVERY@EXAMPLE.COM", "Payroll Specialist;", "03.02.2021"]) {
    expect(raw).toContain(JSON.stringify(value));
  }
  for (const id of [
    ...person.draft.name,
    ...person.draft.email,
    ...person.draft.jobTitle,
    ...person.draft.startDate,
  ]) {
    expect(raw).toContain(JSON.stringify(id));
  }
});

function restoredPeople() {
  const { candidatePages, registry } = documentEvidence(
    [],
    [
      {
        id: "table",
        sheets: [
          {
            name: null,
            rows: [
              ["Name", "Email", "Role", "Hire date"],
              ["Stone, Avery", "AVERY@EXAMPLE.COM", "Payroll Specialist;", "03.02.2021"],
              ["Robin Reed", "", "", ""],
              ["Stone, Avery", "", "", ""],
            ],
          },
        ],
      },
    ],
  );
  const people = selectedRows(
    {
      rows: [1, 2, 3].map((row) => ({ candidate: 0, sheet: 0, row })),
    },
    candidatePages,
    registry,
  );
  return { people, registry };
}
