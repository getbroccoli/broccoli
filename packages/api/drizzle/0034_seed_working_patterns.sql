-- With nothing set up, the people on the default terms work Monday to Friday, 7.5 hours a day,
-- England and Wales bank holidays: one published version, assigned to the default terms from 2000.
INSERT INTO "working_patterns" ("name") VALUES (NULL);--> statement-breakpoint
INSERT INTO "working_pattern_versions" ("working_pattern_id", "status", "monday_minutes", "tuesday_minutes", "wednesday_minutes", "thursday_minutes", "friday_minutes", "saturday_minutes", "sunday_minutes")
	SELECT "id", 'published', 450, 450, 450, 450, 450, 0, 0 FROM "working_patterns";--> statement-breakpoint
INSERT INTO "working_pattern_assignments" ("working_pattern_version_id", "terms_id", "start_date")
	SELECT v."id", t."id", '2000-01-01' FROM "working_pattern_versions" v, "terms" t WHERE t."key" = 'default_terms';
