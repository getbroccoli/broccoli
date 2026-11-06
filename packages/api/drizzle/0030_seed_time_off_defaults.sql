-- A fresh workspace has the default terms and the four time off types; time off is off until setup or the demo gives the terms their policies.
INSERT INTO "terms" ("name", "key") VALUES ('England and Wales', 'default_terms');--> statement-breakpoint
INSERT INTO "time_off_types" ("name", "needs_approval", "private", "type_key", "icon", "colour") VALUES
	('Annual leave', true, false, 'annual_leave', 'sun', 'green'),
	('Sickness', false, true, 'sickness', 'thermometer', 'coral'),
	('Family leave', true, true, 'family_leave', 'baby', 'pink'),
	('Other', true, false, 'other', 'confetti', 'yellow');
