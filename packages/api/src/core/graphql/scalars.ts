import { GraphQLError, GraphQLScalarType, Kind } from "graphql";

import { isCalendarDate } from "../calendar-date";

const DATE_TIME_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;

function parseDate(value: unknown): string {
  if (typeof value !== "string" || !isCalendarDate(value)) {
    throw new GraphQLError("Date must be a real date in YYYY-MM-DD format.");
  }
  return value;
}

function parseDateTime(value: unknown): Date {
  const date = typeof value === "string" && DATE_TIME_WITH_ZONE.test(value) && new Date(value);
  if (!date || Number.isNaN(date.getTime())) {
    throw new GraphQLError("DateTime must be an ISO 8601 date and time with a time zone.");
  }
  return date;
}

/** A calendar day, `YYYY-MM-DD`; a string end to end, so it never shifts with time zones. */
export const DateScalar = new GraphQLScalarType<string, string>({
  name: "Date",
  description: "A calendar day in `YYYY-MM-DD` format.",
  serialize: parseDate,
  parseValue: parseDate,
  parseLiteral: (ast) => parseDate(ast.kind === Kind.STRING ? ast.value : undefined),
});

/** An instant; a JS `Date` inside the API, UTC ISO 8601 on the wire. */
export const DateTimeScalar = new GraphQLScalarType<Date, string>({
  name: "DateTime",
  description: "An instant in ISO 8601 format with a time zone; returned in UTC.",
  serialize: (value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new GraphQLError("DateTime must be a valid Date.");
    }
    return value.toISOString();
  },
  parseValue: parseDateTime,
  parseLiteral: (ast) => parseDateTime(ast.kind === Kind.STRING ? ast.value : undefined),
});
