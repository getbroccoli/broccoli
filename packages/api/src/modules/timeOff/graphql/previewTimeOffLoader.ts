import DataLoader from "dataloader";

import type { GraphqlContext } from "../../../core/graphql";
import type { CalendarDate } from "../../../utils";
import type { TermsMovePreview } from "../../employees";
import type { PersonTimeOff, TimeOffService } from "../app";

interface PreviewedPerson {
  employeeId: string;
  move?: TermsMovePreview;
  from: CalendarDate;
}

function readKey({ move, from }: PreviewedPerson): string {
  return `${move?.termsId ?? ""}:${move?.startDate ?? ""}:${from}`;
}

function personKey(person: PreviewedPerson): string {
  return `${readKey(person)}:${person.employeeId}`;
}

/**
 * Each person's rules for a preview, from a date and maybe as if after a move: every person read
 * the same way is one read.
 */
export function previewTimeOffLoader(timeOff: TimeOffService, context: GraphqlContext) {
  return new DataLoader<PreviewedPerson, PersonTimeOff[] | null, string>(
    async (keys) => {
      const read = new Map<string, PersonTimeOff[]>();
      for (const people of Map.groupBy(keys, readKey).values()) {
        const { move, from } = people[0]!;
        const employeeIds = people.map(({ employeeId }) => employeeId);
        const rules = await timeOff.readPersonTimeOff(context.getActor(), {
          employeeIds,
          move,
          from,
        });
        for (const [employeeId, rows] of rules)
          read.set(personKey({ employeeId, move, from }), rows);
      }
      return keys.map((key) => read.get(personKey(key)) ?? null);
    },
    { cacheKeyFn: personKey },
  );
}
