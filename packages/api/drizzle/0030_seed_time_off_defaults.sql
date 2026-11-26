-- A fresh workspace has the default terms and the four time off types; time off is off until setup or the demo gives the terms their policies.
INSERT INTO "terms" ("name", "key") VALUES ('England and Wales', 'default_terms');--> statement-breakpoint
INSERT INTO "time_off_types" ("name", "approval_process_key", "private", "type_key", "icon", "colour") VALUES
	('Annual leave', 'manager_approval', false, 'annual_leave', 'sun', 'green'),
	('Sickness', null, true, 'sickness', 'thermometer', 'coral'),
	('Family leave', 'manager_approval', true, 'family_leave', 'baby', 'pink'),
	('Other', 'manager_approval', false, 'other', 'confetti', 'yellow');
