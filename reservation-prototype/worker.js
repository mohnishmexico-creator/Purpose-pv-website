/**
 * Purpose PV reservation API prototype.
 * Test-only. Bind D1 as DB and configure ADMIN_TOKEN as a Worker secret.
 * Never deploy this Worker to production without security review and testing.
 */
const ACTIVE = "'requested','confirmed','seated'";
const pad = n => String(n).padStart(2,"0");
function addMinutes(date,time,minutes){
  const [y,mo,d]=date.split("-").map(Number),[h,m]=time.split(":").map(Number);
  const dt=new Date(Date.UTC(y,mo-1,d,h,m+minutes));
  return {date:`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())}`,
    time:`${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`};
}
function validDate(s){return /^\\d{4}-\\d{2}-\\d{2}$/.test(s||"") && !Number.isNaN(Date.parse(s+"T12:00:00Z"));}
function validTime(s){return /^([01]\\d|2[0-3]):[0-5]\\d$/.test(s||"");}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{
  "content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "access-control-allow-origin":"*","access-control-allow-methods":"GET,POST,PATCH,OPTIONS",
  "access-control-allow-headers":"content-type,authorization"
}});}
function isAdmin(req,env){return !!env.ADMIN_TOKEN && req.headers.get("authorization")===`Bearer ${env.ADMIN_TOKEN}`;}
async function assignedBookings(db,date,endDate){
  const r=await db.prepare(`
    SELECT rt.table_id,r.reservation_date,r.start_time,r.end_date,r.end_time,r.status
    FROM reservations r JOIN reservation_tables rt ON rt.reservation_id=r.id
    WHERE r.status IN ('requested','confirmed','seated')
      AND r.reservation_date <= ? AND r.end_date >= ?
  `).bind(endDate,date).all();
  return r.results;
}
function overlaps(aDate,aStart,aEndDate,aEnd,bDate,bStart,bEndDate,bEnd){
  const a0=Date.parse(aDate+"T"+aStart+"Z"),a1=Date.parse(aEndDate+"T"+aEnd+"Z");
  const b0=Date.parse(bDate+"T"+bStart+"Z"),b1=Date.parse(bEndDate+"T"+bEnd+"Z");
  return a0<b1 && b0<a1;
}
export default {
 async fetch(req,env){
  const url=new URL(req.url);
  if(req.method==="OPTIONS") return json({ok:true});
  if(!env.DB) return json({error:"D1 binding DB is not configured."},503);
  if(url.pathname==="/api/health" && req.method==="GET")
    return json({ok:true,service:"purpose-reservations",mode:"private-prototype"});
  if(url.pathname==="/api/tables" && req.method==="GET"){
    if(!isAdmin(req,env)) return json({error:"Unauthorized"},401);
    const r=await env.DB.prepare("SELECT id,capacity,is_active,staff_notes FROM dining_tables ORDER BY id").all();
    return json({tables:r.results});
  }
  if(url.pathname==="/api/availability" && req.method==="GET"){
    const date=url.searchParams.get("date"),party=Number(url.searchParams.get("party_size"));
    if(!validDate(date)||!Number.isInteger(party)||party<1||party>8)
      return json({error:"Provide a valid date and party_size from 1 to 8."},400);
    const weekday=new Date(date+"T12:00:00Z").getUTCDay();
    if(weekday===1) return json({date,party_size:party,duration_minutes:party<=3?90:120,available_times:[],message:"Closed Mondays."});
    const duration=party<=3?90:120;
    const eligible=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1 AND capacity>=? ORDER BY capacity,id").bind(party).all();
    const all=await assignedBookings(env.DB,date,date);
    const times=["17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30"];
    const available_times=times.filter(t=>{
      const end=addMinutes(date,t,duration);
      if(end.date!==date || end.time>"22:00") return false;
      return eligible.results.some(table=>!all.some(b=>b.table_id===table.id &&
        overlaps(date,t,end.date,end.time,b.reservation_date,b.start_time,b.end_date,b.end_time)));
    });
    return json({date,party_size:party,duration_minutes:duration,available_times});
  }
  if(url.pathname==="/api/reservations" && req.method==="POST"){
    let body;try{body=await req.json();}catch{return json({error:"Invalid JSON."},400);}
    const {guest_name,phone,email=null,party_size,reservation_date,start_time,language="en",special_requests=null}=body||{};
    const party=Number(party_size);
    if(!guest_name?.trim()||!phone?.trim()||!Number.isInteger(party)||party<1||party>8||
       !validDate(reservation_date)||!validTime(start_time)||!["en","es"].includes(language))
      return json({error:"Please provide valid guest details, date, time and party size (1–8)."},400);
    if(new Date(reservation_date+"T12:00:00Z").getUTCDay()===1)
      return json({error:"Purpose is closed on Mondays."},400);
    const duration=party<=3?90:120,end=addMinutes(reservation_date,start_time,duration);
    if(end.date!==reservation_date||end.time>"22:00"||start_time<"17:00")
      return json({error:"Choose an arrival time that allows the full seating period before closing."},400);
    const eligible=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1 AND capacity>=? ORDER BY capacity,id").bind(party).all();
    if(!eligible.results.length) return json({error:"No configured table can seat this party yet. Please contact Purpose."},409);
    const all=await assignedBookings(env.DB,reservation_date,end.date);
    const free=eligible.results.find(t=>!all.some(b=>b.table_id===t.id &&
      overlaps(reservation_date,start_time,end.date,end.time,b.reservation_date,b.start_time,b.end_date,b.end_time)));
    if(!free) return json({error:"No table is available at that time. Please choose another time."},409);
    const id=crypto.randomUUID(),code=crypto.randomUUID().slice(0,8).toUpperCase();
    try{
      // D1 batch is transactional; database trigger in migration 0002 is the final
      // authority that rejects an overlapping assignment even if two requests race.
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO reservations
          (id,confirmation_code,guest_name,phone,email,party_size,reservation_date,start_time,duration_minutes,end_date,end_time,status,source,language,special_requests)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,'confirmed','online',?,?)`)
          .bind(id,code,guest_name.trim(),phone.trim(),email,party,reservation_date,start_time,duration,end.date,end.time,language,special_requests),
        env.DB.prepare("INSERT INTO reservation_tables (reservation_id,table_id) VALUES (?,?)").bind(id,free.id)
      ]);
    }catch(e){
      if(String(e).includes("TABLE_TIME_CONFLICT")) return json({error:"That table was just booked. Please choose another time."},409);
      return json({error:"Booking could not be saved. Please try again."},500);
    }
    return json({ok:true,confirmation_code:code,date:reservation_date,start_time,end_time:end.time,duration_minutes:duration},201);
  }
  if(url.pathname.startsWith("/api/reservations/")&&req.method==="PATCH"){
    if(!isAdmin(req,env)) return json({error:"Unauthorized"},401);
    const id=url.pathname.split("/").pop();let body;try{body=await req.json();}catch{return json({error:"Invalid JSON."},400);}
    const allowed=["confirmed","seated","completed","cancelled","no_show"];
    if(body.status&&!allowed.includes(body.status)) return json({error:"Invalid status."},400);
    try{
      if(body.status) await env.DB.prepare("UPDATE reservations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.status,id).run();
      if(body.internal_notes!==undefined) await env.DB.prepare("UPDATE reservations SET internal_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(body.internal_notes),id).run();
    }catch(e){if(String(e).includes("TABLE_TIME_CONFLICT"))return json({error:"Status change would cause a table conflict."},409);throw e;}
    const r=await env.DB.prepare("SELECT id,confirmation_code,guest_name,party_size,reservation_date,start_time,duration_minutes,end_date,end_time,status FROM reservations WHERE id=?").bind(id).first();
    return r?json({reservation:r}):json({error:"Reservation not found."},404);
  }
  return json({error:"Not found."},404);
 }
};
