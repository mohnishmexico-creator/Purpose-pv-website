# Purpose PV — reservation system prototype

This branch is isolated from `main`. It does not change the live website, the live reservation page, or TableAgent.

## Agreed operating rules
- Nine tables (IDs 1–9).
- Parties of 1–3: 90-minute seating.
- Parties of 4 and above: 120-minute seating.
- Reservation availability is based on table occupancy intervals, not just matching start times.
- Staff can add phone bookings and walk-ins, extend a seating, reassign tables, and release tables.
- Guest-facing flow is bilingual (English/Spanish).

## Important floor-plan item
The final seat capacity for each of the nine tables is not yet confirmed in the current project record. The migration creates tables 1–9 with NULL capacities on purpose. Do not enable automatic assignment until those capacities and any permitted table combinations are confirmed.

## Planned architecture
- Cloudflare Pages for the website front end.
- Cloudflare Worker for the reservation API.
- Cloudflare D1 for reservation records and table assignments.
- All date/time input is restaurant-local Puerto Vallarta time.
- No customer data or live booking is present in this prototype.

## D1 setup (not yet performed)
1. Create a separate D1 database for testing.
2. Apply `migrations/0001_initial.sql`.
3. Add the D1 binding to a dedicated preview Worker configuration.
4. Configure an admin secret as a Worker secret; never commit it.
5. Test booking conflicts, cancellation, seating extension, and walk-ins using fictional records.
6. Only after owner approval, plan a separate production migration.

## Safety / correctness rules
- Never expose the staff API without authentication.
- Create reservations and table assignments atomically.
- Reject overlapping table intervals.
- Cancelled and completed reservations do not block future availability.
- Re-check availability at write time to prevent two guests taking the same table.
