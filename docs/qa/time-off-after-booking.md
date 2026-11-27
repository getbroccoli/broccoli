# QA: Changes after booking time off

Use a disposable development workspace with synthetic `example.com` employees, following [QA setup](setup.md). Use fresh employees for each check. Unless a check specifies other rules, start them before the current leave year on Monday to Friday with England and Wales bank holidays and the 28-day Annual leave rules that include bank holidays.

For the two-week checks, choose two consecutive future Monday–Friday weeks in the current leave year with no bank holidays. Note both Thursdays and the second Monday. If the current leave year has no such window left, run those checks early in the next leave year.

## Change a working week with the calendar open

1. Book Annual leave for both weeks. Check that the booking costs 10 days and Used is 10.
2. Keep the booking month open in Time off. Open the same person's panel in another tab. Under Employment terms, give them their own working week and set Thursday to Off.
3. Set **Applies from** to Today and save. Switch the panel to Overview and switch back to the existing calendar tab without refreshing or navigating away.
4. Repeat with a fresh employee, setting **Applies from** to the second Monday of the booking.

- [ ] **Today** — Used falls to 8. The calendar leaves both Thursdays out of the bar and daily counts, and each piece of the bar has rounded ends. Booking details show 8 days deducted and both Thursdays cost 0.
- [ ] **Second Monday** — Used falls to 9. The first Thursday still counts. The calendar leaves the second Thursday out of the bar and daily counts. Booking details show 9 days deducted and the second Thursday costs 0.
- [ ] If a Thursday is in another month, keep that month open in another tab before saving so it can be checked the same way. After recording the open-tab result for each date, revisit Time off and select the booking months again. Check the bar, counts and booking details separately.
- [ ] Cancel the booking for the employee whose week changed from Today. Used falls to 0. Remaining increases by exactly 8 from its post-change value and History shows 8 days returned.

## Reduce entitlement and adjust the balance

1. Assign the employee to dedicated test terms with the standard 28-day rule from the first day of the current leave year. Book the same 10 days. Publish a reduction to 16 days including bank holidays from that year's first day.
2. Check Entitlement 16 and Used 10. Remaining is negative, at 16 minus the displayed bank holidays minus 10. The booking still deducts 10 days.
3. Adjust by +3.5 with a reason. Remaining increases by 3.5. Check the history entries for the adjustment, the rules change and the 10-day booking.

## Change a working week during approval

1. Follow [Request and approve](time-off.md#request-and-approve) to set up an employee and their manager. Request both weeks as the employee.
2. Check Used 0 and a waiting request. As the owner, give that employee Thursdays off from Today. Note the recalculated Remaining before approval.
3. Approve as the manager. Check that the employee's panel shows Used 8 and Remaining decreases by exactly 8 from the pre-approval value. As the manager, open the booking from the calendar and check that its details show 8 days deducted.

## Cancel across New Year

1. Book from the last working day of the current leave year to the first working day of the next leave year. The preview shows one chargeable day in each year and skips New Year's Day or its substitute.
2. Open the booking and cancel it. Check both months in the calendar. Both booked dates are free and the bank holiday remains marked.

## Keep personal rules through a change to shared terms

1. Assign two people to dedicated test terms from the first day of the current leave year, with 20 days plus bank holidays effective from that date. Give one person their own Annual leave rule of 26 days plus bank holidays from that date and book their 10 days.
2. Publish 22 days plus bank holidays on the shared terms from the first day of the leave year. The person with their own rules stays at 16 remaining. The colleague on the shared terms shows 22 remaining.
3. On the first person's Employment terms tab, use the shared terms' Annual leave rules from Today. The Annual leave row shows the inherited 22-day rule plus bank holidays. On Overview, verify that Used stays at 10 and Remaining uses the 26-day rate before the return date and the 22-day rate from that date, prorated by calendar days and rounded up to the next half day before subtracting the 10 booked days.
