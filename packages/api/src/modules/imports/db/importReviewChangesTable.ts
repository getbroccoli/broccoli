import { sql } from "drizzle-orm";
import { bigint, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * One review change: the `import_choices` rows of every key it wrote, as they were before it,
 * so Undo can put them back, latest change first. A source change deletes them all.
 */
export const importReviewChanges = pgTable("import_review_changes", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuidv7()`),
  // The order the changes were made in, under the import's lock; a uuidv7 id can go back with the clock.
  position: bigint("position", { mode: "number" }).generatedAlwaysAsIdentity(),
  type: text("type", { enum: ["employee"] }).notNull(),
  previousChoices: jsonb("previous_choices").$type<PreviousChoice[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A key's stored choice before the change, or null when it had none. */
export interface PreviousChoice {
  key: string;
  choice: { typeVersion: number; leftOut: boolean; values: unknown } | null;
}
