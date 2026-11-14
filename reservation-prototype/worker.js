import { connect } from "cloudflare:sockets";

/** Purpose PV reservation API prototype. Test-only. */
const ACTIVE = "'requested','confirmed','seated'";
const pad = n => String(n).padStart(2,"0");
function addMinutes(date,time,minutes){
  const [y,mo,d]=date.split("-").map(Number),[h,m]=time.split(":").map(Number);
  const dt=new Date(Date.UTC(y,mo-1,d,h,m+minutes));
  return {date:`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())}`,
    time:`${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`};
}
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||"") && !Number.isNaN(Date.parse(s+"T12:00:00Z"));}
function validTime(s){return /^([01]\d|2[0-3]):[0-5]\d$/.test(s||"");}
function seatingDuration(party,time){
  if(time==="21:00") return party<=3?60:90;
  return party<=3?90:120;
}
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

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function confirmationEmail(r){
  const es=r.language==="es";
  const date=escapeHtml(r.reservation_date),time=escapeHtml(r.start_time);
  const name=escapeHtml(r.guest_name),code=escapeHtml(r.confirmation_code);
  const thali=Number(r.thali_count||0),ala=Number(r.party_size)-thali;
  const content=es
    ? `<p>Hola ${name},</p><p>Tu reservación en <strong>Purpose Indian Kitchen</strong> está confirmada.</p><p><strong>Código de confirmación:</strong> ${code}<br><strong>Fecha:</strong> ${date}<br><strong>Hora:</strong> ${time}<br><strong>Personas:</strong> ${r.party_size}</p><p><strong>Thali:</strong> ${thali} · <strong>A la carta:</strong> ${ala}</p><p>Última orden de cocina a las 9:30 pm.</p><p>Roma 193, Versalles, Puerto Vallarta<br>WhatsApp: +52 322 109 0525</p><p>¡Te esperamos!<br>Purpose PV</p>`
    : `<p>Hello ${name},</p><p>Your reservation at <strong>Purpose Indian Kitchen</strong> is confirmed.</p><p><strong>Confirmation code:</strong> ${code}<br><strong>Date:</strong> ${date}<br><strong>Arrival:</strong> ${time}<br><strong>Guests:</strong> ${r.party_size}</p><p><strong>Thali:</strong> ${thali} · <strong>À la carte:</strong> ${ala}</p><p>Last kitchen order is at 9:30 pm.</p><p>Roma 193, Versalles, Puerto Vallarta<br>WhatsApp: +52 322 109 0525</p><p>We look forward to welcoming you.<br>Purpose PV</p>`;
  return {subject:es?`Reservación confirmada · Purpose PV · ${code}`:`Reservation confirmed · Purpose PV · ${code}`,content};
}
function base64Utf8(value){
  const bytes=new TextEncoder().encode(String(value));
  let binary="";
  for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}
async function sendZohoConfirmation(env,reservation){
  if(!env.ZOHO_SMTP_PASSWORD) return {status:"not_configured"};
  const username=env.ZOHO_SMTP_USER||"info@purposepv.com";
  if(!username.includes("@") || !username.split("@")[1]?.includes(".") ||
     !(reservation.email||"").includes("@") || !(reservation.email||"").split("@")[1]?.includes("."))
    throw new Error("INVALID_EMAIL_ADDRESS");
  const socket=connect({hostname:"smtppro.zoho.com",port:465},{secureTransport:"on"});
  const reader=socket.readable.getReader(),writer=socket.writable.getWriter();
  const decoder=new TextDecoder();
  let buffer="";
  async function reply(){
    while(true){
      const end=buffer.search(/\r?\n/);
      if(end>=0){
        const line=buffer.slice(0,end);
        buffer=buffer.slice(end+(buffer.slice(end).startsWith("\r\n")?2:1));
        const match=line.match(/^(\d{3})([ -])(.*)$/);
        if(match&&match[2]===" ") return Number(match[1]);
        continue;
      }
      const part=await reader.read();
      if(part.done) throw new Error("SMTP_CONNECTION_CLOSED");
      buffer+=decoder.decode(part.value,{stream:true});
    }
  }
  async function command(line,expected){
    await writer.write(new TextEncoder().encode(line+"\r\n"));
    const status=await reply();
    if(!expected.includes(status)) throw new Error("SMTP_COMMAND_FAILED_"+status);
    return status;
  }
  try{
    if(await reply()!==220) throw new Error("SMTP_GREETING_FAILED");
    await command("EHLO purposepv.com",[250]);
    await command("AUTH PLAIN "+base64Utf8("\0"+username+"\0"+env.ZOHO_SMTP_PASSWORD),[235]);
    await command("MAIL FROM:<"+username+">",[250]);
    await command("RCPT TO:<"+reservation.email+">",[250,251]);
    await command("DATA",[354]);
    const mail=confirmationEmail(reservation);
    const subject="=?UTF-8?B?"+base64Utf8(mail.subject)+"?=";
    const body=base64Utf8(mail.content);
    const lines=body.match(/.{1,76}/g)||[];
    const message=[
      "From: Purpose PV <"+username+">",
      "To: <"+reservation.email+">",
      "Subject: "+subject,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      ...lines
    ].join("\r\n").replace(/(^|\r\n)\./g,"$1..");
    await writer.write(new TextEncoder().encode(message+"\r\n.\r\n"));
    if(await reply()!==250) throw new Error("SMTP_MESSAGE_REJECTED");
    await command("QUIT",[221]);
    return {status:"sent"};
  } finally {
    try{await writer.close();}catch{}
    try{await reader.cancel();}catch{}
    try{socket.close();}catch{}
  }
}

export default {
 async fetch(req,env,ctx){
  const url=new URL(req.url);
  if(req.method==="OPTIONS") return json({ok:true});
  if(req.method==="GET" && (url.pathname==="/" || url.pathname==="/index.html") && env.ASSETS)
    return env.ASSETS.fetch(new Request(new URL("/index.html",req.url),req));
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
    const thaliCount=Number(url.searchParams.get("thali_count")||0);
    if(!Number.isInteger(thaliCount)||thaliCount<0||thaliCount>party)
      return json({error:"thali_count must be between 0 and party_size."},400);
    if(!validDate(date)||!Number.isInteger(party)||party<1||party>8)
      return json({error:"Provide a valid date and party_size from 1 to 8."},400);
    const weekday=new Date(date+"T12:00:00Z").getUTCDay();
    if(weekday===1) return json({date,party_size:party,available_times:[],message:"Closed Mondays."});
    const isThursday=weekday===4;
    if(thaliCount>0&&!isThursday) return json({error:"Thali reservations are available on Thursdays only."},400);
    const eligible=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1 AND capacity>=? ORDER BY capacity,id").bind(party).all();
    const all=await assignedBookings(env.DB,date,date);
    const times=["17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00"];
    const available_times=[];
    const thali_remaining={};
    for(const t of times){
      const duration=seatingDuration(party,t),end=addMinutes(date,t,duration);
      if(end.date!==date || (t!=="21:00" && end.time>"22:00")) continue;
      const tableFree=eligible.results.some(table=>!all.some(b=>b.table_id===table.id &&
        overlaps(date,t,end.date,end.time,b.reservation_date,b.start_time,b.end_date,b.end_time)));
      if(!tableFree) continue;
      if(isThursday&&thaliCount>0){
        const hour=t.slice(0,2);
        const used=await env.DB.prepare("SELECT COALESCE(SUM(thali_count),0) AS used FROM reservations WHERE reservation_date=? AND substr(start_time,1,2)=? AND status IN ('requested','confirmed','seated')").bind(date,hour).first();
        const remaining=Math.max(0,12-(used?.used||0));
        thali_remaining[hour]=remaining;
        if(remaining<thaliCount) continue;
      }
      available_times.push(t);
    }
    return json({date,party_size:party,thali_count:thaliCount,available_times,
      thali_hourly_limit:isThursday?12:null,thali_remaining,kitchen_last_order:"21:30",
      note:"Last kitchen order at 9:30 pm. 9:00 pm arrival: 60-minute seating for 1–3 guests; 90 minutes for 4–8 guests."});
  }
  if(url.pathname==="/api/reservations" && req.method==="POST"){
    let body;try{body=await req.json();}catch{return json({error:"Invalid JSON."},400);}
    const {guest_name,phone,email,party_size,reservation_date,start_time,language="en",special_requests=null}=body||{};
    const party=Number(party_size),thaliCount=Number(body?.thali_count||0);
    if(!guest_name?.trim()||!phone?.trim()||!email?.trim()||!/^\S+@\S+\.\S+$/.test(email.trim())||!Number.isInteger(party)||party<1||party>8||
       !Number.isInteger(thaliCount)||thaliCount<0||thaliCount>party||
       !validDate(reservation_date)||!validTime(start_time)||!["en","es"].includes(language))
      return json({error:"Please provide valid guest details, date, time and party size (1–8)."},400);
    const weekday=new Date(reservation_date+"T12:00:00Z").getUTCDay();
    if(weekday===1) return json({error:"Purpose is closed on Mondays."},400);
    if(thaliCount>0&&weekday!==4) return json({error:"Thali reservations are available on Thursdays only."},400);
    if(start_time<"17:00"||start_time>"21:00")
      return json({error:"Choose an arrival time between 5:00 pm and 9:00 pm."},400);
    const duration=seatingDuration(party,start_time),end=addMinutes(reservation_date,start_time,duration);
    if(end.date!==reservation_date||(start_time!=="21:00"&&end.time>"22:00"))
      return json({error:"Choose an available arrival time."},400);
    const eligible=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1 AND capacity>=? ORDER BY capacity,id").bind(party).all();
    if(!eligible.results.length) return json({error:"No configured table can seat this party yet. Please contact Purpose."},409);
    const all=await assignedBookings(env.DB,reservation_date,end.date);
    const free=eligible.results.find(t=>!all.some(b=>b.table_id===t.id &&
      overlaps(reservation_date,start_time,end.date,end.time,b.reservation_date,b.start_time,b.end_date,b.end_time)));
    if(!free) return json({error:"No table is available at that time. Please choose another time."},409);
    if(weekday===4&&thaliCount>0){
      const used=await env.DB.prepare("SELECT COALESCE(SUM(thali_count),0) AS used FROM reservations WHERE reservation_date=? AND substr(start_time,1,2)=? AND status IN ('requested','confirmed','seated')").bind(reservation_date,start_time.slice(0,2)).first();
      if((used?.used||0)+thaliCount>12) return json({error:"Only 12 Thali guests are available in this hour. Please reduce the Thali count or choose another hour."},409);
    }
    const id=crypto.randomUUID(),code=crypto.randomUUID().slice(0,8).toUpperCase();
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO reservations
          (id,confirmation_code,guest_name,phone,email,party_size,thali_count,reservation_date,start_time,duration_minutes,end_date,end_time,status,source,language,special_requests)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'confirmed','online',?,?)`)
          .bind(id,code,guest_name.trim(),phone.trim(),email,party,thaliCount,reservation_date,start_time,duration,end.date,end.time,language,special_requests),
        env.DB.prepare("INSERT INTO reservation_tables (reservation_id,table_id) VALUES (?,?)").bind(id,free.id)
      ]);
    }catch(e){
      if(String(e).includes("TABLE_TIME_CONFLICT")) return json({error:"That table was just booked. Please choose another time."},409);
      if(String(e).includes("THALI_HOURLY_LIMIT")) return json({error:"Only 12 Thali guests are available in this hour. Please choose another hour or reduce the Thali count."},409);
      return json({error:"Booking could not be saved. Please try again."},500);
    }
    const recipient=email.trim();
    await env.DB.prepare("UPDATE reservations SET email_status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
    const emailPayload={guest_name:guest_name.trim(),email:recipient,confirmation_code:code,reservation_date,start_time,
      party_size:party,thali_count:thaliCount,language};
    const sendAndRecord=async()=>{
      try{
        const mailResult=await sendZohoConfirmation(env,emailPayload);
        const status=mailResult.status==="sent"?"sent":"failed";
        const error=status==="sent"?null:"Zoho credentials are not configured";
        await env.DB.prepare("UPDATE reservations SET email_status=?,email_error=?,email_sent_at=CASE WHEN ?='sent' THEN CURRENT_TIMESTAMP ELSE email_sent_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(status,error,status,id).run();
      }catch(e){
        await env.DB.prepare("UPDATE reservations SET email_status='failed',email_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(String(e?.message||"EMAIL_SEND_FAILED").slice(0,120),id).run();
      }
    };
    if(ctx?.waitUntil) ctx.waitUntil(sendAndRecord());
    else await sendAndRecord();
    return json({ok:true,confirmation_code:code,date:reservation_date,start_time,end_time:end.time,duration_minutes:duration,
      thali_count:thaliCount,alacarte_count:party-thaliCount,email_status:"queued",
      kitchen_last_order:"21:30",guest_note:language==="es"?"Última orden de cocina a las 9:30 pm.":"Last kitchen order at 9:30 pm."},201);
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
