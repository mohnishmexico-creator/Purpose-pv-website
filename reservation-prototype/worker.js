/**
 * Purpose PV reservation API prototype.
 * Bind D1 as DB and set ADMIN_TOKEN as a Worker secret before deploying to preview.
 * This file is not wired into the live site.
 */
const ACTIVE = new Set(["requested", "confirmed", "seated"]);
const pad = n => String(n).padStart(2, "0");
function localEnd(date, time, minutes) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, m] = time.split(":").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, m + minutes));
  return { date: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())}`, time: `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}` };
}
function overlaps(aDate, aStart, aEndDate, aEnd, bDate, bStart, bEndDate, bEnd) {
  const a0 = `${aDate}T${aStart}`, a1 = `${aEndDate}T${aEnd}`;
  const b0 = `${bDate}T${bStart}`, b1 = `${bEndDate}T${bEnd}`;
  return a0 < b1 && b0 < a1;
}
function json(data, status=200) {
  return new Response(JSON.stringify(data), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","access-control-allow-origin":"'self'"}});
}
function authorized(req, env) {
  return Boolean(env.ADMIN_TOKEN) && req.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;
}
async function tableConflicts(db, tableId, date, start, endDate, end) {
  const rows = await db.prepare(`
    SELECT r.reservation_date, r.start_time, r.end_time, r.duration_minutes, r.status
    FROM reservations r JOIN reservation_tables rt ON rt.reservation_id=r.id
    WHERE rt.table_id=? AND r.status IN ('requested','confirmed','seated')
      AND (r.reservation_date <= ? AND r.reservation_date || 'T' || r.end_time > ?)
      AND (r.reservation_date >= ? OR r.reservation_date || 'T' || r.start_time < ?)
  `).bind(tableId, endDate, `${date}T${start}`, date, `${endDate}T${end}`).all();
  return rows.results.length > 0;
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null,{headers:{
      "access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,OPTIONS",
      "access-control-allow-headers":"content-type,authorization"
    }});
    if (!env.DB) return json({error:"D1 database binding DB is not configured."},503);
    if (url.pathname === "/api/health" && req.method === "GET") return json({ok:true,service:"purpose-reservations",mode:"prototype"});
    if (url.pathname === "/api/tables" && req.method === "GET") {
      if (!authorized(req,env)) return json({error:"Unauthorized"},401);
      const r=await env.DB.prepare("SELECT id,capacity,is_active,staff_notes FROM dining_tables ORDER BY id").all();
      return json({tables:r.results});
    }
    if (url.pathname === "/api/availability" && req.method === "GET") {
      const date=url.searchParams.get("date"), party=Number(url.searchParams.get("party_size"));
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date||"") || !Number.isInteger(party) || party<1 || party>12)
        return json({error:"Provide date=YYYY-MM-DD and party_size=1..12."},400);
      const duration=party<=3?90:120;
      const tables=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1 AND capacity IS NOT NULL AND capacity>=? ORDER BY capacity,id").bind(party).all();
      const bookings=await env.DB.prepare(`
        SELECT rt.table_id,r.reservation_date,r.start_time,r.end_time,r.status
        FROM reservations r JOIN reservation_tables rt ON rt.reservation_id=r.id
        WHERE r.status IN ('requested','confirmed','seated')
          AND r.reservation_date BETWEEN ? AND ?
      `).bind(date,date).all();
      return json({date,party_size:party,duration_minutes:duration,eligible_tables:tables.results.map(t=>t.id),bookings:bookings.results});
    }
    if (url.pathname === "/api/reservations" && req.method === "POST") {
      let body; try { body=await req.json(); } catch { return json({error:"Invalid JSON"},400); }
      const {guest_name,phone,email=null,party_size,reservation_date,start_time,language="en",special_requests=null}=body||{};
      const party=Number(party_size);
      if (!guest_name?.trim() || !phone?.trim() || !Number.isInteger(party) || party<1 || party>8 ||
          !/^\\d{4}-\\d{2}-\\d{2}$/.test(reservation_date||"") || !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(start_time||"") || !["en","es"].includes(language))
        return json({error:"Please provide valid guest details, date, time and party size (1–8)."},400);
      const duration=party<=3?90:120, end=localEnd(reservation_date,start_time,duration);
      const eligible=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1 AND capacity>=? ORDER BY capacity,id").bind(party).all();
      if (!eligible.results.length) return json({error:"No configured table can seat this party. Please contact Purpose."},409);
      const all=await env.DB.prepare(`
        SELECT rt.table_id,r.reservation_date,r.start_time,r.end_time,r.status
        FROM reservations r JOIN reservation_tables rt ON rt.reservation_id=r.id
        WHERE r.status IN ('requested','confirmed','seated')
          AND r.reservation_date BETWEEN ? AND ?
      `).bind(reservation_date,end.date).all();
      const free=eligible.results.find(t=>!all.results.some(b=>b.table_id===t.id &&
        overlaps(reservation_date,start_time,end.date,end.time,b.reservation_date,b.start_time,b.reservation_date,b.end_time)));
      if (!free) return json({error:"No table is available at that time. Please choose another time."},409);
      const id=crypto.randomUUID(), code=crypto.randomUUID().slice(0,8).toUpperCase();
      // Insert booking and assignment together. Before production, add a transactional
      // conditional conflict guard to protect against simultaneous submissions.
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO reservations
          (id,confirmation_code,guest_name,phone,email,party_size,reservation_date,start_time,duration_minutes,end_time,status,source,language,special_requests)
          VALUES (?,?,?,?,?,?,?,?,?,?, 'confirmed','online',?,?)`)
          .bind(id,code,guest_name.trim(),phone.trim(),email,party,reservation_date,start_time,duration,end.time,language,special_requests),
        env.DB.prepare("INSERT INTO reservation_tables (reservation_id,table_id) VALUES (?,?)").bind(id,free.id)
      ]);
      return json({ok:true,confirmation_code:code,table:free.id,date:reservation_date,start_time:start_time,end_time:end.time,duration_minutes:duration},201);
    }
    if (url.pathname.startsWith("/api/reservations/") && req.method==="PATCH") {
      if (!authorized(req,env)) return json({error:"Unauthorized"},401);
      const id=url.pathname.split("/").pop(); let body; try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
      const allowed=["confirmed","seated","completed","cancelled","no_show"];
      if(body.status && !allowed.includes(body.status)) return json({error:"Invalid status"},400);
      if(body.status) await env.DB.prepare("UPDATE reservations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.status,id).run();
      if(body.internal_notes!==undefined) await env.DB.prepare("UPDATE reservations SET internal_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(body.internal_notes),id).run();
      const r=await env.DB.prepare("SELECT id,confirmation_code,guest_name,party_size,reservation_date,start_time,duration_minutes,end_time,status FROM reservations WHERE id=?").bind(id).first();
      return r?json({reservation:r}):json({error:"Reservation not found"},404);
    }
    return json({error:"Not found"},404);
  }
};
