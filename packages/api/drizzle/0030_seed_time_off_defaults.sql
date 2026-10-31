-- A fresh workspace runs UK leave with nothing to set up: everyone gets the statutory minimum.
INSERT INTO "policy_groups" ("name", "key") VALUES ('Everyone', 'everyone');--> statement-breakpoint
INSERT INTO "time_off_types" ("name", "needs_approval", "private", "type_key") VALUES
	('Annual leave', true, false, 'annual_leave'),
	('Sickness', false, true, 'sickness'),
	('Family leave', true, true, 'family_leave'),
	('Other', true, false, 'other');--> statement-breakpoint
INSERT INTO "time_off_policies" ("time_off_type_id", "name", "policy_group_id", "balance", "bank_holidays", "leave_year_start", "leave_year_start_month", "leave_year_start_day")
	SELECT t."id", t."name", g."id",
		CASE WHEN t."type_key" = 'annual_leave' THEN 'balance_from_allowance' ELSE 'no_balance' END,
		CASE WHEN t."type_key" = 'annual_leave' THEN 'bank_holidays_included_in_allowance' END,
		CASE WHEN t."type_key" = 'annual_leave' THEN 'leave_year_from_fixed_date' END,
		CASE WHEN t."type_key" = 'annual_leave' THEN 1 END,
		CASE WHEN t."type_key" = 'annual_leave' THEN 1 END
	FROM "time_off_types" t CROSS JOIN "policy_groups" g WHERE g."key" = 'everyone';--> statement-breakpoint
INSERT INTO "time_off_allowance_rules" ("time_off_policy_id", "kind", "entitlement_days", "entitlement_days_per_week", "max_days")
	SELECT p."id", 'yearly_entitlement', 28, 5, 28
	FROM "time_off_policies" p JOIN "time_off_types" t ON t."id" = p."time_off_type_id" WHERE t."type_key" = 'annual_leave';
