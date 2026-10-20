import { expect, it } from "vitest";

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

it.each(["name", "firstName", "lastName", "email", "jobTitle", "startDate"])(
  "rejects a repeated reference in the %s field",
  (field) => {
    const { registry } = referenceEvidence();
    const draft = { ...emptyDraft, [field]: ["w00001", "w00001"] };

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
