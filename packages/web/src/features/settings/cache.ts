import type { ApolloCache } from "@apollo/client";

import { TimeOffSettingsDocument } from "@/__generated__/graphql";
import { evictRecord } from "@/apollo";

/** Removes a deleted time off type from every cached list, such as a person's balances. */
export function forgetTimeOffType(cache: ApolloCache, id: string): void {
  cache.batch({
    update(cache) {
      cache.updateQuery({ query: TimeOffSettingsDocument }, (data) =>
        data
          ? {
              ...data,
              timeOffSettings: {
                ...data.timeOffSettings,
                timeOffTypes: data.timeOffSettings.timeOffTypes.filter(
                  ({ timeOffType }) => timeOffType.id !== id,
                ),
              },
            }
          : data,
      );
      evictRecord(cache, "TimeOffType", id);
    },
  });
}

/** Removes a deleted location from every cached list. */
export function forgetLocation(cache: ApolloCache, id: string): void {
  evictRecord(cache, "Location", id);
}

/** Drops cached terms, so an open stack fetches them again, or lists leave them out once deleted. */
export function forgetTerms(cache: ApolloCache, id: string): void {
  evictRecord(cache, "Terms", id);
}
