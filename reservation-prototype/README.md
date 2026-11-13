# Purpose PV — reservation system prototype

This branch is isolated from `main`. It does not change the live website, live reservation page, or TableAgent.

## Owner-confirmed floor plan
| Table | Seats |
|---|---:|
| 1 | 8 |
| 2 | 4 |
| 3 | 4 |
| 4 | 2 |
| 5 | 2 |
| 6 | 4 |
| 7 | 2 |
| 8 | 4 |
| 9 | 2 |
| **Total** | **32** |

The confirmed table capacities total 32 seats. No table-combination rules are assumed yet.

## Agreed operating rules
- Nine tables (IDs 1–9).
- Parties of 1–3: 90-minute seating.
- Parties of 4–8: 120-minute seating.
- Restaurant hours: Tuesday–Sunday, 17:00–22:00; closed Mondays.
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
5. Test booking, cancellation, conflict handling and staff operations with fictional records.
6. Complete a security and concurrency review before considering production.

## Safety requirements
- Staff endpoints require authentication.
- Database trigger rejects overlapping table assignments.
- Cancelled, completed and no-show reservations do not block availability.
- No deployment or live customer bookings without explicit owner approval.
