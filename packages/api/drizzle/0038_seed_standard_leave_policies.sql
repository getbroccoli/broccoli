-- The seeded Annual leave policy becomes the UK statutory minimum; two more standard policies grant bank holidays on top.
UPDATE "time_off_policies" SET "name" = 'UK statutory minimum', "key" = 'uk_statutory_minimum'
	WHERE "time_off_type_id" = (SELECT "id" FROM "time_off_types" WHERE "type_key" = 'annual_leave');--> statement-breakpoint
INSERT INTO "time_off_policies" ("time_off_type_id", "name", "key", "balance", "bank_holidays", "leave_year_start", "leave_year_start_month", "leave_year_start_day")
	SELECT t."id", p."name", p."key", 'balance_from_allowance', 'bank_holidays_on_top_of_allowance', 'leave_year_from_fixed_date', 1, 1
	FROM "time_off_types" t CROSS JOIN (VALUES
		('20 days plus bank holidays', 'uk_20_days_plus_bank_holidays'),
		('25 days plus bank holidays', 'uk_25_days_plus_bank_holidays')) AS p ("name", "key")
	WHERE t."type_key" = 'annual_leave';--> statement-breakpoint
INSERT INTO "time_off_allowance_rules" ("time_off_policy_id", "kind", "entitlement_days", "entitlement_days_per_week")
	SELECT "id", 'yearly_entitlement', CASE "key" WHEN 'uk_20_days_plus_bank_holidays' THEN 20 ELSE 25 END, 5
	FROM "time_off_policies" WHERE "key" IN ('uk_20_days_plus_bank_holidays', 'uk_25_days_plus_bank_holidays');--> statement-breakpoint
-- A fresh workspace gives no terms a time off policy until an admin or the demo links one.
DELETE FROM "terms_time_off_policies";
