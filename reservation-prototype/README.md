# Purpose PV — reservation system prototype

This branch is isolated from `main`. It does not change the live website, live reservation page, or TableAgent.

## Owner-confirmed floor plan
| Table | Seats |
|---|---:|
| 1 | 8 |
| 2 | 4 |
| 3 | 4 |
| 4 | 2 |
| 5 | 4 |
| 6 | 2 |
| 7 | 4 |
| 8 | 2 |
| 9 | 6 |
| **Total** | **36** |

Automatic assignment always chooses the smallest suitable single table; it never combines tables. Staff can manually select multiple tables when needed.

## Reservation and closing rules
- Nine tables (IDs 1–9).
- All parties of 1–8 receive 120 minutes of seating.
- Last available arrival is 8:00 pm, so every reservation ends by the 10:00 pm closing time.
- Last kitchen order: 9:30 pm. Display this note clearly in the guest booking flow and confirmation; do not display a required departure time.
- Tuesday–Sunday, 5:00–8:00 pm arrival slots every 30 minutes; closed Mondays.
- Thursday bookings let each guest be designated Thali or à la carte within the same party. The booking stores the Thali guest count and the remaining party members are à la carte.
- Thali allocation is capped at 12 guests per clock hour on Thursdays (5–6, 6–7, 7–8, 8–9, and 9–10 pm). The cap counts guests, not reservations; à la carte guests do not consume the allocation. Cancelled/completed/no-show reservations release the allocation.
- The guest flow requests a Thali count from zero through the party size on Thursdays only; non-Thursdays are à la carte.
- Availability is calculated from table occupancy intervals.
- Guest booking interface is English/Spanish.
- Staff workflow supports phone reservations, walk-ins, reservation listing, table reassignment, internal notes, and status updates (seated, completed, cancelled, no-show).

## Planned architecture
- Existing Cloudflare Pages site for front end, only after approval.
- Cloudflare Worker for the reservation API.
- Isolated staging Worker `purpose-reservations-staging` bound to the test D1 database.
- Separate, migrated production D1 database `purpose-reservations-production-db` (empty, nine tables / 36 seats).
- Reserved production Worker script `purpose-reservations-test` retains the configured staff and Zoho SMTP secrets; `wrangler.production.toml` promotes it to the production D1 and clean production assets. Do not deploy it until the owner says to switch.
- Puerto Vallarta local date/time handling.
- No real customer data or live bookings in this prototype.

## Test setup and automated checks
1. Create a dedicated D1 test database.
2. Apply migrations in order: `0001_initial.sql`, `0002_conflict_guards.sql`, `0003_guest_birthday.sql`, `0003_thursday_thali_limit.sql`, `0004_email_delivery.sql`, `0005_staff_login_throttle.sql`, and `0006_rebuild_conflict_guards.sql`.
3. Bind test D1 to the staging Worker; CI deploys only to staging.
4. Production D1 and production assets are prepared separately. Production Worker promotion is guarded by a dedicated workflow and rollback config; it is not triggered until `production-deploy.trigger` is intentionally added.
5. The staging Worker uses a public CI-only staff token and suppressed email. The reserved production Worker has `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, and `ZOHO_SMTP_PASSWORD` secret bindings; SMTP authentication was verified without sending an email. Never commit secret values.
6. CI verifies single-table allocation, 120-minute seating and the 8:00 pm final arrival, Thali limits, booking conflicts, cancellation/no-show/completion, phone bookings, walk-ins, and staff table reassignment using fictional records.
7. Complete final owner approval and live email-delivery check before switching the website.

## Safety requirements
- Staff endpoints require authentication.
- Database trigger rejects overlapping table assignments.
- Cancelled, completed and no-show reservations do not block availability.
- No deployment or live customer bookings without explicit owner approval.
