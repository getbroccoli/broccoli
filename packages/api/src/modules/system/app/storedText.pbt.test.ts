import fc from "fast-check";
import { expect, hostileText, storedTextProbe, storedTextSnapshot, test } from "#test/support";
import { ApplicationError } from "../../../core/applicationError";

test.for(
  [
    ...[
      "terms.create",
      "terms.update",
      "terms.clone",
      "location.create",
      "location.update",
      "company.name",
    ].map((entry) => ({ entry, limit: 100 })),
    ...["type.create", "type.change"].map((entry) => ({ entry, limit: 60 })),
    ...["create", "update"].flatMap((operation) =>
      ["firstName", "lastName", "email", "jobTitle"].map((field) => ({
        entry: `employee.${operation}.${field}`,
        limit: field === "email" ? 254 : 100,
      })),
    ),
    ...["update", "delete", "profiles"].map((operation) => ({
      entry: `employee.reason.${operation}`,
      limit: 500,
    })),
    { entry: "task.cancelReason", limit: 1000 },
    { entry: "invite.note", limit: 1000 },
    { entry: "setup.inviteNote", limit: 1000 },
    { entry: "mail.from", limit: 254 },
    { entry: "mail.secret", limit: 1000 },
  ].flatMap((entry) =>
    (["nul", "unicode", "limits"] as const).map((family) => ({ ...entry, family })),
  ),
)(
  "property: $entry stores or refuses $family text atomically",
  async ({ entry, family, limit }, { orm, seed }) => {
    await fc.assert(
      fc.asyncProperty(hostileText(family, limit), async (value) => {
        // Arrange
        const probe = await storedTextProbe(orm, seed, entry, value);
        const before = await storedTextSnapshot(orm);

        // Act
        const [result] = await Promise.allSettled([probe.act()]);

        // Assert
        if (result.status === "rejected") {
          expect(await storedTextSnapshot(orm)).toEqual(before);
          expect(result.reason).toBeInstanceOf(ApplicationError);
          expect(["INVALID_INPUT", "NOT_FOUND", "CONFLICT", "FORBIDDEN"]).toContain(
            (result.reason as ApplicationError).code,
          );
        } else expect(await probe.read()).toBe(probe.expected?.toWellFormed() ?? null);
      }),
      { numRuns: 12 },
    );
  },
);
