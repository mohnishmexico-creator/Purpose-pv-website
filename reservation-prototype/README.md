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

No table-combination rules are assumed.

## Reservation and closing rules
- Nine tables (IDs 1–9).
- Standard arrivals: parties of 1–3 receive 90 minutes; parties of 4–8 receive 120 minutes.
- Final arrival at 9:00 pm: parties of 1–3 receive 60 minutes; parties of 4–8 receive 90 minutes.
- Last kitchen order: 9:30 pm. Display this note clearly in the guest booking flow and confirmation; do not display a required departure time.
- The 9:00 pm final seating is not presented to guests with a departure deadline. Parties of 4–8 may remain for their 90-minute seating, ending at 10:30 pm.
- Tuesday–Sunday, 5:00–9:00 pm arrival slots; closed Mondays.
- Availability is calculated from table occupancy intervals.
- Guest booking interface is English/Spanish.
- Staff workflow will support phone bookings, walk-ins, seating extensions, reassignment and release.

## Planned architecture
- Existing Cloudflare Pages site for front end, only after approval.
- Cloudflare Worker for the reservation API.
- Separate Cloudflare D1 test database for records and table assignments.
- Puerto Vallarta local date/time handling.
- No real customer data or live bookings in this prototype.

## Test setup (not performed)
1. Create a dedicated D1 test database.
2. Apply migrations in order: `0001_initial.sql`, then `0002_conflict_guards.sql`.
3. Bind D1 to a dedicated preview Worker, not the live site.
4. Configure `ADMIN_TOKEN` as a Worker secret; never commit it.
5. Test standard and 9:00 pm durations, booking conflicts, cancellation and staff operations using fictional records.
6. Complete security and concurrency review before production.

## Safety requirements
- Staff endpoints require authentication.
- Database trigger rejects overlapping table assignments.
- Cancelled, completed and no-show reservations do not block availability.
- No deployment or live customer bookings without explicit owner approval.
