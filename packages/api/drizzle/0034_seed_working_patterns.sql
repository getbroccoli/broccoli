-- With nothing set up, the people on the default terms work Monday to Friday, 7.5 hours a day.
INSERT INTO "working_patterns" ("terms_id")
	SELECT "id" FROM "terms" WHERE "key" = 'default_terms';--> statement-breakpoint
INSERT INTO "working_pattern_versions" ("working_pattern_id", "monday_minutes", "tuesday_minutes", "wednesday_minutes", "thursday_minutes", "friday_minutes", "saturday_minutes", "sunday_minutes", "full_day_minutes")
	SELECT p."id", 450, 450, 450, 450, 450, 0, 0, 450
	FROM "working_patterns" p JOIN "terms" g ON g."id" = p."terms_id" WHERE g."key" = 'default_terms';
