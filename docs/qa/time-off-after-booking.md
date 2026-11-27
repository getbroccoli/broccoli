# QA: Changes after booking time off

Use a disposable development workspace with synthetic `example.com` employees, following [QA setup](setup.md). Use fresh employees for each check. Unless a check specifies other rules, start them before 2026 on Monday to Friday with England and Wales bank holidays and the 28-day Annual leave rules that include bank holidays.

The exact figures use 27 Nov 2026. To run later, prepare the checkout and dependencies in a disposable Linux VM and set the guest clock before starting the stack and browser inside it:

```sh
sudo timedatectl set-ntp false
sudo timedatectl set-timezone UTC
sudo timedatectl set-time '2026-11-27 12:00:00'
date -u +%F
```

The last command and `new Date().toISOString().slice(0, 10)` in the browser console should both give `2026-11-27`.

## Change a working week with the calendar open

1. Book Annual leave for 7–18 Dec 2026. Check that the booking costs 10 days and the panel shows Used 10 and Remaining 10.
2. Keep the December Time off calendar open. Open the same person's panel in another tab. Under Employment terms, give them their own working week and set Thursday to Off.
3. Set **Applies from** to Today and save. Switch the panel to Overview and switch back to the existing calendar tab. Keep the calendar on December without refreshing or navigating away.
4. Repeat with a fresh employee. With the clock still on 27 Nov, set **Applies from** to 14 Dec 2026.

- [ ] **27 Nov** — the panel shows Entitlement 27.5, Used 8 and Remaining 11.5. The calendar leaves 10 and 17 Dec out of the bar and daily counts, and each piece of the bar has rounded ends. Booking details show 8 days deducted and both Thursdays cost 0.
- [ ] **14 Dec** — the panel shows Entitlement 28, Used 9 and Remaining 11. The calendar still counts 10 Dec. It leaves 17 Dec out of the bar and daily counts. Booking details show 9 days deducted and 17 Dec costs 0.
- [ ] After recording the open-tab result for each date, revisit Time off in the app and select December again. Check the bar, daily counts and booking details separately.
- [ ] Cancel the 27 Nov fixture's booking. Used falls to 0 and Remaining rises from 11.5 to 19.5. History shows 8 days returned.

## Reduce entitlement and adjust the balance

1. Assign the employee to dedicated test terms with the standard 28-day rule from 1 Jan 2026. Book the same 10 days. Publish a reduction to 16 days including bank holidays from 1 Jan 2026.
2. Check Entitlement 16, Bank holidays 8, Used 10 and Remaining −2. The booking still deducts 10 days.
3. Adjust by +3.5 with a reason. Check Remaining 1.5 and the history entries for the adjustment, the rules change and the 10-day booking.

## Change a working week during approval

1. Follow [Request and approve](time-off.md#request-and-approve) to set up an employee and their manager. Request 7–18 Dec as the employee.
2. Check Used 0, Remaining 20 and a waiting request. As the owner, give that employee Thursdays off from 27 Nov.
3. Approve as the manager. Check that the employee's panel shows Used 8 and Remaining 11.5. As the manager, open the booking from the calendar and check that its details show 8 days deducted.

## Cancel across New Year

1. Book 31 Dec 2026–4 Jan 2027. The preview shows one chargeable day in each leave year and skips New Year's Day.
2. Open the booking and cancel it. Check December and January in the calendar. Both booked dates are free and 1 Jan still shows as a bank holiday.

## Keep personal rules through a change to shared terms

1. Assign two people to dedicated test terms from 1 Jan 2026, with 20 days plus bank holidays effective from that date. Give one person their own Annual leave rule of 26 days plus bank holidays from that date and book their 10 days in December.
2. Publish 22 days plus bank holidays on the shared terms from 1 Jan. The person with their own rules stays at 16 remaining. The colleague on the shared terms shows 22 remaining.
3. On the first person's Employment terms tab, use the shared terms' Annual leave rules from 27 Nov. The Annual leave row shows the inherited 22-day rule plus bank holidays. On Overview, the current year's prorated entitlement still rounds up to 34 including bank holidays, with 10 used and 16 remaining.
