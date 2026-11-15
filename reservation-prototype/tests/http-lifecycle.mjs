const base = process.env.TEST_BASE_URL;
const runId = process.env.TEST_RUN_ID || String(Date.now());
const d = new Date();
const delta = ((4 - d.getUTCDay() + 7) % 7) || 7;
d.setUTCDate(d.getUTCDate() + delta);
const date = d.toISOString().slice(0,10);
function assert(x,m){if(!x)throw new Error(m)}
async function available(time,party,thali){
 const r=await fetch(base+`/api/availability?date=${date}&party_size=${party}&thali_count=${thali}`);
 const j=await r.json();
 assert(r.ok,`availability request failed: ${JSON.stringify(j)}`);
 assert(j.available_times.includes(time),`Expected ${time} to reopen after cancellation/no-show/completion: ${JSON.stringify(j.available_times)}`);
}
await available("17:00",8,8); // 8-person booking was cancelled; 4-person booking is still active
console.log("PASS cancelled booking releases its table and Thali allocation");
await available("17:30",4,4); // no-show booking no longer blocks
console.log("PASS no-show booking releases its table and Thali allocation");
await available("19:00",2,0); // completed booking no longer blocks
console.log("PASS completed booking releases its table");
console.log("All cancellation lifecycle checks passed for run "+runId+".");
