# Purpose PV reservations — go-live checklist

This is a launch runbook only. The live website and TableAgent must remain unchanged until the owner explicitly says to switch.

## Tested staging system
- Guest booking page: https://purpose-reservations-staging.mohnishmexico.workers.dev/
- Staff page: https://purpose-reservations-staging.mohnishmexico.workers.dev/staff
- Isolated database: `purpose-reservations-test-db`
- Staging suppresses all email and CI fixtures are cleared after every test run.

## Prepared production resources
- Production Worker: `purpose-reservations-test`
- Production Worker URL: https://purpose-reservations-test.mohnishmexico.workers.dev/
- Production database: `purpose-reservations-production-db`
- Production database was initialized and verified with 9 tables, 36 total seats, zero reservations, and all three database protection triggers.
- Production deployment has passed a Wrangler dry run. It has not been promoted.

## Reservation rules now implemented
- 120-minute seating for every party size from 1–8.
- Last available arrival: 8:00 pm; every seating ends by 10:00 pm.
- Last kitchen order: 9:30 pm.
- Tuesday–Sunday; closed Mondays.
- Thursday Thali allocation: 12 guests per clock hour.
- English and Spanish guest booking flow.
- Same-day arrival slots that have already passed are disabled in the guest and staff forms and rejected by the APIs.
- Staff tools: phone reservations, walk-ins, table assignment, internal notes, seating status, cancellation, no-show, and completion.

## Before switching
1. Owner confirms the actual capacity of each of the nine tables. Current database configuration is 1=8, 2=4, 3=4, 4=2, 5=4, 6=2, 7=4, 8=2, 9=6 (36 seats total). Do not assume this breakdown is correct without owner confirmation.
2. Check TableAgent for future reservations. The production database is empty; any existing future bookings must be transferred before TableAgent is disabled.
3. Owner gives explicit go-live approval.

## Go-live sequence
1. Manually run the GitHub Actions workflow **Promote Purpose reservations Worker**. This is the only workflow that deploys the production Worker and production D1 binding.
2. Confirm the workflow's production health, guest page, 8:00 pm final arrival, 120-minute seating copy, staff page, unauthenticated API protection, and disabled test-only SMTP endpoint all pass.
3. Change the iframe and fallback URL in the prepared root `reservations.html` from the staging Worker URL to the production Worker URL.
4. Apply the prepared `reservations.html`, `index.html`, `es/index.html`, `menu/index.html`, and `es/menu/index.html` changes to `main`. The homepage schemas must point to `https://purposepv.com/reservations`, and all menu reservation links must point to the new page.
5. Deploy the website's reservation-page, menu-link and schema changes to the `main` branch / Cloudflare Pages.
6. Verify the public page and staff page on the live domain. Perform an owner-approved real test reservation and confirm the guest email and owner notification arrive.
7. Only after the new flow is confirmed and any future TableAgent reservations are transferred, disable TableAgent booking availability and remove any remaining TableAgent booking links.

## Rollback
- If the production Worker promotion smoke test fails, its workflow automatically redeploys the private prototype configuration; the website has not yet been changed at that stage.
- If the website is switched and a later problem appears, restore the previous TableAgent version of `reservations.html` and the previous reservation schema URLs, then redeploy Cloudflare Pages. Keep the new production database intact for diagnosis; do not delete bookings.
