const base = process.env.TEST_BASE_URL;
const runId = process.env.TEST_RUN_ID || String(Date.now());
if (!base) throw new Error("TEST_BASE_URL is required");
const prefix = `CI TEST ${runId}`;
const nextDay = (weekday) => {
  const d = new Date();
  const delta = ((weekday - d.getUTCDay() + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};
const thursday = nextDay(4);
const saturday = nextDay(6);
const monday = nextDay(1);
async function postBooking(label, {date=thursday,time="17:00",party=2,thali=0}) {
  const response = await fetch(base + "/api/reservations", {
    method: "POST",
    headers: {"content-type":"application/json"},
    body: JSON.stringify({
      guest_name: prefix + " " + label,
      phone: "+52 000 000 0000",
      email: `ci-${runId}-${label.toLowerCase().replace(/[^a-z0-9]+/g,"-")}@example.invalid`,
      party_size: party, thali_count: thali,
      reservation_date: date, start_time: time, language: "en",
      special_requests: "Automated isolated test; no guest contact"
    })
  });
  const data = await response.json();
  return {response, data};
}
function assert(condition, message) { if (!condition) throw new Error(message); }
let a = await postBooking("A8", {time:"17:00",party:8,thali:8});
assert(a.response.status===201 && a.data.ok, "8-person Thali booking should succeed: "+JSON.stringify(a.data));
assert(a.data.duration_minutes===120, "4–8 guest seating should be 120 minutes");
assert(a.data.email_status==="not_requested", "test email must be suppressed");
console.log("PASS guest booking: 8 guests / 8 Thalis / 120 minutes");

let b = await postBooking("B4", {time:"17:30",party:4,thali:4});
assert(b.response.status===201 && b.data.ok, "4-person Thali booking should succeed: "+JSON.stringify(b.data));
console.log("PASS guest booking: second table allocation within same Thali hour");

let capped = await postBooking("CAP1", {time:"17:00",party:1,thali:1});
assert(capped.response.status===409, "13th Thali guest in the same clock hour must be rejected");
console.log("PASS 12-Thali-per-hour limit rejects the 13th guest");

let c = await postBooking("C2", {time:"19:00",party:2,thali:0});
assert(c.response.status===201 && c.data.duration_minutes===90, "standard 1–3 guest booking should be 90 minutes");
console.log("PASS 1–3 guest standard seating: 90 minutes");

let d = await postBooking("D2LATE", {time:"21:00",party:2,thali:0});
assert(d.response.status===201 && d.data.duration_minutes===60, "9 pm 1–3 guest seating should be 60 minutes");
let e = await postBooking("E4LATE", {time:"21:00",party:4,thali:0});
assert(e.response.status===201 && e.data.duration_minutes===90, "9 pm 4–8 guest seating should be 90 minutes");
console.log("PASS final 9 pm seating: 60 minutes for 1–3, 90 minutes for 4–8");

let closed = await postBooking("MONDAY", {date:monday,time:"17:00",party:2,thali:0});
assert(closed.response.status===400, "Monday booking must be rejected");
let wrongDay = await postBooking("NONTHALI", {date:saturday,time:"17:00",party:2,thali:1});
assert(wrongDay.response.status===400, "Thali on a non-Thursday must be rejected");
console.log("PASS Monday closure and Thursday-only Thali rules");

const availability = await fetch(base+`/api/availability?date=${thursday}&party_size=1&thali_count=1`);
const av = await availability.json();
assert(availability.ok && !av.available_times.includes("17:00"), "availability must hide a fully allocated Thali hour");
console.log("PASS availability reflects the hourly Thali cap");
console.log("All guest booking integration tests passed for "+thursday+".");
