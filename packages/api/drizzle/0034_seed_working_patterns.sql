-- With nothing set up, everyone works Monday to Friday, 7.5 hours a day.
INSERT INTO "working_patterns" ("name", "key") VALUES ('Standard', 'standard_working_pattern');--> statement-breakpoint
INSERT INTO "working_pattern_weeks" ("working_pattern_id", "monday_minutes", "tuesday_minutes", "wednesday_minutes", "thursday_minutes", "friday_minutes", "saturday_minutes", "sunday_minutes", "full_day_minutes")
	SELECT "id", 450, 450, 450, 450, 450, 0, 0, 450 FROM "working_patterns" WHERE "key" = 'standard_working_pattern';--> statement-breakpoint
INSERT INTO "terms_working_patterns" ("terms_id", "working_pattern_id")
	SELECT g."id", p."id" FROM "terms" g CROSS JOIN "working_patterns" p
	WHERE g."key" = 'default_terms' AND p."key" = 'standard_working_pattern';--> statement-breakpoint
-- England and Wales terms get the default time off policies for all dates.
INSERT INTO "terms_time_off_policies" ("terms_id", "time_off_type_id", "time_off_policy_id")
	SELECT g."id", p."time_off_type_id", p."id"
	FROM "time_off_policies" p JOIN "time_off_types" t ON t."id" = p."time_off_type_id"
	CROSS JOIN "terms" g WHERE t."type_key" IS NOT NULL AND g."key" = 'default_terms';
