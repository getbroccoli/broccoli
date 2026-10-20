import { expect, it } from "vitest";

import type { DraftRecord } from "../../../../integrations/ai";

import { InvalidModelOutputError } from "./extractionErrors";
import { documentEvidence } from "./maskedEvidence";
import { referencedRecords } from "./referenceRecords";

it("joins name and role words with spaces and email and date words without spaces", () => {
  const { registry } = referenceEvidence();
  const draft = {
    name: ["w00001", "w00002"],
    firstName: [],
    lastName: [],
    email: ["w00003", "w00004"],
    jobTitle: ["w00005", "w00006"],
    startDate: ["w00007", "w00008", "w00009"],
    nameSource: "combined" as const,
    dateOrder: "dmy" as const,
  };

  expect(referencedRecords({ records: [draft] }, registry)).toEqual([
    {
      source: {
        name: "Avery Stone",
        firstName: null,
        lastName: null,
        email: "avery@example.com",
        jobTitle: "Payroll Specialist",
        startDate: "03.02.2021",
        nameSource: "combined",
        dateOrder: "dmy",
      },
      draft,
    },
  ]);
});

it("rejects a reference that is not in the local registry", () => {
  const { registry } = referenceEvidence();
  const draft = { ...emptyDraft, name: ["w99999"] };

  expect(() => referencedRecords({ records: [draft] }, registry)).toThrow(InvalidModelOutputError);
});

it.each(["combined", "separate"] as const)(
  "omits a record with no %s name references while keeping named records",
  (nameSource) => {
    const { registry } = referenceEvidence();
    const nameless = { ...emptyDraft, nameSource, email: ["w00003", "w00004"] };
    const named = { ...emptyDraft, name: ["w00001", "w00002"] };

    const records = referencedRecords({ records: [nameless, named] }, registry);

    expect(records).toMatchObject([{ draft: named, source: { name: "Avery Stone" } }]);
  },
);

it.each([
  { nameSource: "combined" as const, firstName: ["w00001"], lastName: [] },
  { nameSource: "combined" as const, firstName: [], lastName: ["w00002"] },
  { nameSource: "separate" as const, firstName: ["w00001"], lastName: ["w00002"] },
])("rejects mixed name representations when nameSource is $nameSource", (names) => {
  const { registry } = referenceEvidence();
  const draft = { ...emptyDraft, ...names, name: ["w00001", "w00002"] };

  expect(() => referencedRecords({ records: [draft] }, registry)).toThrow(InvalidModelOutputError);
});

it.each(["name", "firstName", "lastName", "email", "jobTitle", "startDate"])(
  "rejects a repeated reference in the %s field",
  (field) => {
    const { registry } = referenceEvidence();
    const nameSource = field === "firstName" || field === "lastName" ? "separate" : "combined";
    const draft: DraftRecord = {
      ...emptyDraft,
      nameSource,
      name: nameSource === "combined" ? ["w00001", "w00002"] : [],
      [field]: ["w00001", "w00001"],
    };

    expect(() => referencedRecords({ records: [draft] }, registry)).toThrow(
      InvalidModelOutputError,
    );
  },
);

it("fills a missing date order from the restored date's shape", () => {
  const { registry } = referenceEvidence();
  const draft = {
    ...emptyDraft,
    name: ["w00001", "w00002"],
    startDate: ["w00007", "w00008", "w00009"],
  };

  const [record] = referencedRecords({ records: [draft] }, registry);

  expect(record!.source).toMatchObject({ startDate: "03.02.2021", dateOrder: "dmy" });
});

const emptyDraft = {
  name: [],
  firstName: [],
  lastName: [],
  email: [],
  jobTitle: [],
  startDate: [],
  nameSource: "combined" as const,
  dateOrder: null,
};

function referenceEvidence() {
  const values = [
    "Avery",
    "Stone",
    "avery@",
    "example.com",
    "Payroll",
    "Specialist",
    "03.",
    "02.",
    "2021",
  ];
  return documentEvidence(
    [
      {
        width: 612,
        height: 792,
        words: values.map((text, index) => ({
          text,
          left: 40,
          top: 20 + index * 20,
          right: 140,
          bottom: 30 + index * 20,
        })),
      },
    ],
    [],
  );
}
