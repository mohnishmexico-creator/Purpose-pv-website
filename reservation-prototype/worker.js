import { connect } from "cloudflare:sockets";
import { chooseTables, overlaps } from "./allocation.mjs";
import { seatingDuration, weekdayForDate, isArrivalTime } from "./booking-rules.mjs";
import { thaliRemaining, exceedsThaliLimit } from "./thali-rules.mjs";
import { validateTableSelection } from "./staff-rules.mjs";

/** Purpose PV reservation API prototype. Test-only. */
const ACTIVE = "'requested','confirmed','seated'";
const pad = n => String(n).padStart(2,"0");
function addMinutes(date,time,minutes){
  const [y,mo,d]=date.split("-").map(Number),[h,m]=time.split(":").map(Number);
  const dt=new Date(Date.UTC(y,mo-1,d,h,m+minutes));
  return {date:`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth()+1)}-${pad(dt.getUTCDate())}`,
    time:`${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}`};
}
function validDate(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s||""))return false;
  const d=new Date(s+"T12:00:00Z");
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function pvDateTime(){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Mexico_City",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {date:values.year+"-"+values.month+"-"+values.day,time:values.hour+":"+values.minute};
}
function pvToday(){return pvDateTime().date;}
function isPastDate(s){return s<pvToday();}
function isPastArrival(date,time){
  const now=pvDateTime();
  return date<now.date||(date===now.date&&time<=now.time);
}
function validTime(s){return /^([01]\\d|2[0-3]):[0-5]\\d$/.test(s||"");}
function isPrivateEventBlocked(date,startTime,endDate,endTime){
  if(date!=="2026-11-15" || endDate!=="2026-11-15") return false;
  return startTime < "18:30" && endTime > "17:00";
}
function validBirthday(s){ if(s==null||s==="") return true; if(!/^\d{2}-\d{2}$/.test(s)) return false; const [m,d]=s.split("-").map(Number); const dt=new Date(Date.UTC(2000,m-1,d)); return dt.getUTCMonth()===m-1 && dt.getUTCDate()===d; }
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{
  "content-type":"application/json; charset=utf-8","cache-control":"no-store",
  "x-content-type-options":"nosniff","referrer-policy":"no-referrer"
}});}
function b64url(bytes){let s="";for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replace(/=/g,"").replaceAll("+","-").replaceAll("/","_");}
async function signSession(payload,secret){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 return b64url(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(payload)));
}
async function isAdmin(req,env){
 if(env.SUPPRESS_EMAILS==="true"&&env.TEST_ADMIN_TOKEN&&req.headers.get("x-purpose-test-admin")===env.TEST_ADMIN_TOKEN)return true;
 if(!env.ADMIN_SESSION_SECRET)return false;
 const cookie=req.headers.get("cookie")||"",m=cookie.match(/(?:^|; )purpose_staff=([^;]+)/);
 if(!m)return false;
 const [payload,signature]=decodeURIComponent(m[1]).split(".");
 if(!payload||!signature)return false;
 const expected=await signSession(payload,env.ADMIN_SESSION_SECRET);
 if(signature!==expected)return false;
 try{const data=JSON.parse(atob(payload.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-payload.length%4)%4)));return data.exp>Date.now()&&data.role==="staff";}catch{return false;}
}
function sameOrigin(req){const origin=req.headers.get("origin");return !!origin&&origin===new URL(req.url).origin;}
async function assignedBookings(db,date,endDate){
  const r=await db.prepare(`
    SELECT rt.table_id,r.reservation_date,r.start_time,r.end_date,r.end_time,r.status
    FROM reservations r JOIN reservation_tables rt ON rt.reservation_id=r.id
    WHERE r.status IN ('requested','confirmed','seated')
      AND r.reservation_date <= ? AND r.end_date >= ?
  `).bind(endDate,date).all();
  return r.results;
}
function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function confirmationEmail(r){
  const es=r.language==="es";
  const date=escapeHtml(r.reservation_date),time=escapeHtml(r.start_time);
  const name=escapeHtml(r.guest_name),code=escapeHtml(r.confirmation_code);
  const thali=Number(r.thali_count||0),ala=Number(r.party_size)-thali;
  const label=(en,spanish)=>es?spanish:en;
  const greeting=es?"Hola":"Hello";
  const intro=es
    ?"Tu reservación en Purpose Indian Kitchen está confirmada."
    :"Your reservation at Purpose Indian Kitchen is confirmed.";
  const details=es?[
    ["Código de confirmación",code],["Fecha",date],["Hora de llegada",time],["Personas",String(r.party_size)]
  ]:[
    ["Confirmation code",code],["Date",date],["Arrival",time],["Guests",String(r.party_size)]
  ];
  const rows=details.map(([k,v],i)=>`<tr><td style="padding:10px 12px;border-bottom:1px solid #eee8df;color:#625b53;font-size:14px;">${k}</td><td style="padding:10px 12px;border-bottom:1px solid #eee8df;text-align:right;color:#26221e;font-size:14px;font-weight:600;word-break:break-word;">${v}</td></tr>`).join("");
  const closing=es?"¡Te esperamos!":"We look forward to welcoming you.";
  const kitchen=es?"Última orden de cocina a las 9:30 pm.":"Last kitchen order is at 9:30 pm.";
  const address="Roma 193, Versalles, Puerto Vallarta";
  const contact="WhatsApp: +52 322 109 0525";
  const content=`<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f6f2eb;font-family:Arial,Helvetica,sans-serif;color:#26221e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8dfd3;border-radius:8px;">
      <tr><td style="padding:28px 24px 20px;text-align:center;background:#29241f;border-radius:8px 8px 0 0;">
        <div style="font-size:11px;letter-spacing:3px;color:#d8bd8a;font-weight:700;">PURPOSE PV</div>
        <div style="font-size:23px;line-height:1.3;color:#fff;margin-top:8px;font-weight:600;">Purpose Indian Kitchen</div>
        <div style="font-size:13px;color:#e7ddd0;margin-top:6px;">${label("Reservation confirmation","Confirmación de reservación")}</div>
      </td></tr>
      <tr><td style="padding:26px 24px 8px;font-size:15px;line-height:1.6;">
        <p style="margin:0 0 10px;">${greeting} ${name},</p>
        <p style="margin:0 0 18px;">${intro}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee8df;border-radius:6px;border-collapse:separate;">
          ${rows}
        </table>
        <p style="margin:18px 0 6px;font-size:14px;line-height:1.6;"><strong>${label("Thali","Thali")}:</strong> ${thali} &nbsp;·&nbsp; <strong>${label("À la carte","A la carta")}:</strong> ${ala}</p>
        <p style="margin:14px 0 0;font-size:13px;line-height:1.6;color:#625b53;">${kitchen}</p>
        <p style="margin:16px 0 0;font-size:14px;line-height:1.7;">${address}<br>${contact}</p>
        <p style="margin:22px 0 0;font-size:15px;line-height:1.6;">${closing}<br><strong>Purpose PV</strong></p>
      </td></tr>
      <tr><td style="padding:16px 24px;text-align:center;background:#faf8f4;border-top:1px solid #eee8df;border-radius:0 0 8px 8px;font-size:11px;color:#81786e;">${label("Thank you for choosing Purpose.","Gracias por elegir Purpose.")}</td></tr>
    </table>
    </body></html>`;
  return {subject:es?`Reservación confirmada · Purpose PV · ${code}`:`Reservation confirmed · Purpose PV · ${code}`,content};
}
function base64Utf8(value){
  const bytes=new TextEncoder().encode(String(value));
  let binary="";
  for(let i=0;i<bytes.length;i+=0x8000) binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}
function ownerNotificationEmail(r){
  const rows=[
    ["Guest",r.guest_name],["Phone",r.phone],["Email",r.guest_email],
    ["Date",r.reservation_date],["Arrival",r.start_time],
    ["Guests",String(r.party_size)],["Thalis",String(r.thali_count)],
    ["À la carte",String(Number(r.party_size)-Number(r.thali_count))],
    ["Confirmation code",r.confirmation_code]
  ].map(([k,v])=>`<tr><td style="padding:9px 12px;border-bottom:1px solid #eee8df;color:#625b53;">${escapeHtml(k)}</td><td style="padding:9px 12px;border-bottom:1px solid #eee8df;text-align:right;font-weight:600;">${escapeHtml(v)}</td></tr>`).join("");
  const content=`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f2eb;padding:24px;color:#26221e;"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#fff;border:1px solid #e8dfd3;"><tr><td style="padding:24px;background:#29241f;color:#fff;"><b style="color:#d8bd8a;">PURPOSE PV</b><h2>New reservation confirmed</h2></td></tr><tr><td style="padding:24px;"><table width="100%" cellpadding="0" cellspacing="0">${rows}</table><p style="margin-top:18px;"><b>Special requests:</b><br>${escapeHtml(r.special_requests||"None")}</p></td></tr></table></body></html>`;
  return {subject:`New reservation · Purpose PV · ${r.confirmation_code}`,content};
}
async function sendZohoMail(env,recipient,mail){
  if(env.SUPPRESS_EMAILS === "true") return {status:"suppressed"};
  if(!env.ZOHO_SMTP_PASSWORD) return {status:"not_configured"};
  const username=env.ZOHO_SMTP_USER||"info@purposepv.com";
  if(!username.includes("@") || !username.split("@")[1]?.includes(".") ||
     !(recipient||"").includes("@") || !(recipient||"").split("@")[1]?.includes("."))
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
    await command("RCPT TO:<"+recipient+">",[250,251]);
    await command("DATA",[354]);
    
    const subject="=?UTF-8?B?"+base64Utf8(mail.subject)+"?=";
    const body=base64Utf8(mail.content);
    const lines=body.match(/.{1,76}/g)||[];
    const message=[
      "From: Purpose PV <"+username+">",
      "To: <"+recipient+">",
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

async function verifyZohoSmtp(env){
  if(!env.ZOHO_SMTP_PASSWORD)return {status:"not_configured"};
  const username=env.ZOHO_SMTP_USER||"info@purposepv.com";
  const socket=connect({hostname:"smtppro.zoho.com",port:465},{secureTransport:"on"});
  const reader=socket.readable.getReader(),writer=socket.writable.getWriter();
  const decoder=new TextDecoder();let buffer="";
  async function reply(){
    while(true){
      const end=buffer.search(/\r?\n/);
      if(end>=0){
        const line=buffer.slice(0,end);
        buffer=buffer.slice(end+(buffer.slice(end).startsWith("\r\n")?2:1));
        const match=line.match(/^(\d{3})([ -])(.*)$/);
        if(match&&match[2]===" ")return Number(match[1]);
        continue;
      }
      const part=await reader.read();
      if(part.done)throw new Error("SMTP_CONNECTION_CLOSED");
      buffer+=decoder.decode(part.value,{stream:true});
    }
  }
  async function command(line,expected){
    await writer.write(new TextEncoder().encode(line+"\r\n"));
    const status=await reply();
    if(!expected.includes(status))throw new Error("SMTP_COMMAND_FAILED_"+status);
  }
  try{
    if(await reply()!==220)throw new Error("SMTP_GREETING_FAILED");
    await command("EHLO purposepv.com",[250]);
    await command("AUTH PLAIN "+base64Utf8("\0"+username+"\0"+env.ZOHO_SMTP_PASSWORD),[235]);
    await command("QUIT",[221]);
    return {status:"authenticated"};
  }finally{
    try{await writer.close()}catch{}
    try{await reader.cancel()}catch{}
    try{socket.close()}catch{}
  }
}

async function sendZohoConfirmation(env,reservation){
  return sendZohoMail(env,reservation.email,confirmationEmail(reservation));
}

export default {
 async fetch(req,env,ctx){
  const url=new URL(req.url);
  if(req.method==="OPTIONS") return json({ok:true});
  if(req.method==="GET" && url.pathname==="/staff" && env.ASSETS)
    return env.ASSETS.fetch(new Request(new URL("/staff.html",req.url),req));
  if(req.method==="GET" && (url.pathname==="/" || url.pathname==="/index.html") && env.ASSETS)
    return env.ASSETS.fetch(new Request(new URL("/index.html",req.url),req));
  if(!env.DB) return json({error:"D1 binding DB is not configured."},503);
  if(url.pathname==="/api/test/smtp"&&req.method==="POST"){
    if(env.SUPPRESS_EMAILS!=="true"||!env.TEST_ADMIN_TOKEN||req.headers.get("x-purpose-test-admin")!==env.TEST_ADMIN_TOKEN)
      return json({error:"Not found."},404);
    if(!sameOrigin(req))return json({error:"Invalid origin."},403);
    try{
      const result=await verifyZohoSmtp(env);
      if(result.status!=="authenticated")return json({error:"Zoho SMTP credentials are not configured."},503);
      return json(result);
    }catch(e){
      console.error("SMTP connectivity test failed:",String(e?.message||e));
      return json({error:"Zoho SMTP authentication failed.",code:String(e?.message||"SMTP_ERROR")},502);
    }
  }
  if(url.pathname==="/api/admin/login"&&req.method==="POST"){
    if(!sameOrigin(req))return json({error:"Invalid origin."},403);
    if(!env.ADMIN_PASSWORD||!env.ADMIN_SESSION_SECRET)return json({error:"Staff login is not configured."},503);
    let body;try{body=await req.json()}catch{return json({error:"Invalid JSON."},400)}
    if(typeof body.password!=="string"||body.password.length>256)
      return json({error:"Incorrect password."},401);
    const ip=req.headers.get("cf-connecting-ip")||"unknown";
    const ipHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip))))
      .map(x=>x.toString(16).padStart(2,"0")).join("");
    const attempts=await env.DB.prepare(
      "SELECT COUNT(*) AS n, MIN(attempted_at) AS oldest FROM staff_login_attempts WHERE ip_hash=? AND attempted_at > datetime('now','-15 minutes')"
    ).bind(ipHash).first();
    if(Number(attempts?.n||0)>=5)
      return json({error:"Too many attempts. Please wait 15 minutes before trying again."},429);
    if(body.password!==env.ADMIN_PASSWORD){
      await env.DB.prepare("INSERT INTO staff_login_attempts (ip_hash) VALUES (?)").bind(ipHash).run();
      return json({error:"Incorrect password."},401);
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM staff_login_attempts WHERE ip_hash=?").bind(ipHash),
      env.DB.prepare("DELETE FROM staff_login_attempts WHERE attempted_at < datetime('now','-1 day')")
    ]);
    const payload=b64url(new TextEncoder().encode(JSON.stringify({role:"staff",exp:Date.now()+8*60*60*1000})));
    const signature=await signSession(payload,env.ADMIN_SESSION_SECRET);
    return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","cache-control":"no-store","set-cookie":`purpose_staff=${payload}.${signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800`}});
  }
  if(url.pathname==="/api/admin/logout"&&req.method==="POST"){
    if(!sameOrigin(req))return json({error:"Invalid origin."},403);
    return new Response(JSON.stringify({ok:true}),{headers:{"content-type":"application/json","set-cookie":"purpose_staff=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"}});
  }
  if(url.pathname==="/api/admin/session"&&req.method==="GET")
    return json({authenticated:await isAdmin(req,env)});
  if(url.pathname==="/api/health" && req.method==="GET")
    return json({ok:true,service:"purpose-reservations",mode:env.DEPLOYMENT_MODE||"private-prototype"});
  if(url.pathname==="/api/admin/reservations" && req.method==="GET"){
    if(!await isAdmin(req,env)) return json({error:"Unauthorized"},401);
    const date=url.searchParams.get("date");
    const from=url.searchParams.get("from")||date;
    const to=url.searchParams.get("to")||date;
    if(!validDate(from)||!validDate(to)||from>to)
      return json({error:"Provide a valid date or date range."},400);
    const rows=await env.DB.prepare(`
      SELECT r.id,r.confirmation_code,r.guest_name,r.phone,r.email,r.birthday,
        r.party_size,r.thali_count,r.reservation_date,r.start_time,r.duration_minutes,
        r.end_date,r.end_time,r.status,r.source,r.language,r.special_requests,
        r.internal_notes,r.email_status,r.created_at,
        GROUP_CONCAT(rt.table_id) AS table_ids
      FROM reservations r
      LEFT JOIN reservation_tables rt ON rt.reservation_id=r.id
      WHERE r.reservation_date BETWEEN ? AND ?
      GROUP BY r.id
      ORDER BY r.reservation_date,r.start_time,r.created_at
    `).bind(from,to).all();
    return json({reservations:rows.results.map(r=>({...r,table_ids:r.table_ids?r.table_ids.split(",").map(Number):[]}))});
  }
  if(url.pathname==="/api/tables" && req.method==="GET"){
    if(!await isAdmin(req,env)) return json({error:"Unauthorized"},401);
    const r=await env.DB.prepare("SELECT id,capacity,is_active,staff_notes FROM dining_tables ORDER BY id").all();
    return json({tables:r.results});
  }
  if(url.pathname==="/api/admin/reservations"&&req.method==="POST"){
    if(!await isAdmin(req,env))return json({error:"Unauthorized"},401);
    if(!sameOrigin(req))return json({error:"Invalid origin."},403);
    let body;try{body=await req.json()}catch{return json({error:"Invalid JSON."},400)}
    const guest_name=String(body.guest_name||"").trim(),phone=String(body.phone||"").trim();
    const email=String(body.email||"").trim(),party=Number(body.party_size);
    const thaliCount=Number(body.thali_count||0),date=body.reservation_date,time=body.start_time;
    const language=body.language==="es"?"es":"en";
    const special_requests=String(body.special_requests||"").trim()||null;
    if(!guest_name||guest_name.length>100||phone.length<7||phone.length>40||
       (email&&(!/^\S+@\S+\.\S+$/.test(email)||email.length>254))||
       !Number.isInteger(party)||party<1||party>8||
       !Number.isInteger(thaliCount)||thaliCount<0||thaliCount>party||
       !validDate(date)||!validTime(time)||isPastArrival(date,time)||!isArrivalTime(time)||
       (special_requests&&special_requests.length>1000))
      return json({error:"Provide valid guest details, date, arrival time and party size (1–8)."},400);
    const weekday=weekdayForDate(date);
    if(weekday===1)return json({error:"Purpose is closed on Mondays."},400);
    if(thaliCount>0&&weekday!==4)return json({error:"Thali reservations are available on Thursdays only."},400);
    const duration=seatingDuration(party,time),end=addMinutes(date,time,duration);
    if(end.date!==date||end.time>"22:00")
      return json({error:"Choose an available arrival time."},400);
    const all=await assignedBookings(env.DB,date,end.date);
    const tables=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1 ORDER BY id").all();
    const tableIds=chooseTables(tables.results,all,date,time,end.date,end.time,party);
    if(isPrivateEventBlocked(date,time,end.date,end.time))return json({error:"The restaurant is reserved for a private event until 6:30 pm. Please choose 6:30 pm or later."},409);
    if(!tableIds)return json({error:"No single table is available for that party size and time."},409);
    if(weekday===4&&thaliCount>0){
      const used=await env.DB.prepare("SELECT COALESCE(SUM(thali_count),0) AS used FROM reservations WHERE reservation_date=? AND substr(start_time,1,2)=? AND status IN ('requested','confirmed','seated')").bind(date,time.slice(0,2)).first();
      if(exceedsThaliLimit(used?.used||0,thaliCount))
        return json({error:"Only 12 Thali guests are available in this hour. Please reduce the Thali count or choose another hour."},409);
    }
    const id=crypto.randomUUID(),code=crypto.randomUUID().slice(0,8).toUpperCase();
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO reservations
          (id,confirmation_code,guest_name,phone,email,party_size,thali_count,reservation_date,start_time,duration_minutes,end_date,end_time,status,source,language,special_requests)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'confirmed','phone',?,?)`)
          .bind(id,code,guest_name,phone,email||null,party,thaliCount,date,time,duration,end.date,end.time,language,special_requests),
        ...tableIds.map(tableId=>env.DB.prepare("INSERT INTO reservation_tables (reservation_id,table_id) VALUES (?,?)").bind(id,tableId))
      ]);
    }catch(e){
      const detail=String(e?.message||e||"");
      if(detail.includes("TABLE_TIME_CONFLICT"))return json({error:"That table was just booked. Please choose another time."},409);
      if(detail.includes("THALI_HOURLY_LIMIT"))return json({error:"Only 12 Thali guests are available in this hour."},409);
      console.error("Phone reservation save failed:",e);
      return json({error:"Phone reservation could not be saved."},500);
    }
    if(email)await env.DB.prepare("UPDATE reservations SET email_status='pending',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
    const emailPayload={guest_name,email,confirmation_code:code,reservation_date:date,start_time:time,party_size:party,thali_count:thaliCount,language};
    const ownerPayload={guest_name,guest_email:email,phone,confirmation_code:code,reservation_date:date,start_time:time,
      party_size:party,thali_count:thaliCount,special_requests,language};
    const notify=async()=>{
      if(email){
        try{
          const mailResult=await sendZohoConfirmation(env,emailPayload);
          const status=mailResult.status==="sent"?"sent":mailResult.status==="suppressed"?"not_requested":"failed";
          const error=status==="sent"?null:status==="not_requested"?"Email delivery disabled in isolated test environment":"Zoho credentials are not configured";
          await env.DB.prepare("UPDATE reservations SET email_status=?,email_error=?,email_sent_at=CASE WHEN ?='sent' THEN CURRENT_TIMESTAMP ELSE email_sent_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(status,error,status,id).run();
        }catch(e){
          await env.DB.prepare("UPDATE reservations SET email_status='failed',email_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(String(e?.message||"EMAIL_SEND_FAILED").slice(0,120),id).run();
        }
      }
      try{await sendZohoMail(env,"info@purposepv.com",ownerNotificationEmail(ownerPayload));}
      catch(e){console.error("OWNER_NOTIFICATION_FAILED",String(e?.message||e));}
    };
    if(ctx?.waitUntil)ctx.waitUntil(notify());else await notify();
    return json({ok:true,confirmation_code:code,date,start_time:time,end_time:end.time,duration_minutes:duration,
      table_ids:tableIds,thali_count:thaliCount,alacarte_count:party-thaliCount,
      email_status:email?(env.SUPPRESS_EMAILS==="true"?"not_requested":"queued"):"not_requested",source:"phone"},201);
  }
  if(url.pathname==="/api/admin/walkins"&&req.method==="POST"){
    if(!await isAdmin(req,env))return json({error:"Unauthorized"},401);
    if(!sameOrigin(req))return json({error:"Invalid origin."},403);
    let body;try{body=await req.json()}catch{return json({error:"Invalid JSON."},400)}
    const party=Number(body.party_size),thali=Number(body.thali_count||0),date=body.reservation_date,time=body.start_time;
    const name=String(body.guest_name||"Walk-in").trim(),phone=String(body.phone||"").trim();
    if(!validDate(date)||!validTime(time)||isPastArrival(date,time)||!Number.isInteger(party)||party<1||party>8||
       !Number.isInteger(thali)||thali<0||thali>party||!isArrivalTime(time)||name.length>100||phone.length>40)
      return json({error:"Provide a valid date, arrival time, party size (1–8) and Thali count."},400);
    const weekday=weekdayForDate(date);
    if(weekday===1)return json({error:"Purpose is closed on Mondays."},400);
    if(thali>0&&weekday!==4)return json({error:"Thali is available Thursdays only."},400);
    const duration=seatingDuration(party,time),end=addMinutes(date,time,duration);
    const all=await assignedBookings(env.DB,date,end.date);
    const tables=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1 ORDER BY id").all();
    const tableIds=chooseTables(tables.results,all,date,time,end.date,end.time,party);
    if(isPrivateEventBlocked(date,time,end.date,end.time))return json({error:"The restaurant is reserved for a private event until 6:30 pm. Please choose 6:30 pm or later."},409);
    if(!tableIds)return json({error:"No table combination is available for that time."},409);
    const id=crypto.randomUUID(),code=crypto.randomUUID().slice(0,8).toUpperCase();
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO reservations
          (id,confirmation_code,guest_name,phone,email,party_size,thali_count,reservation_date,start_time,duration_minutes,end_date,end_time,status,source,language)
          VALUES (?,?,?,?,NULL,?,?,?,?,?,?,?,'seated','walk_in','en')`)
          .bind(id,code,name,phone,party,thali,date,time,duration,end.date,end.time),
        ...tableIds.map(tableId=>env.DB.prepare("INSERT INTO reservation_tables (reservation_id,table_id) VALUES (?,?)").bind(id,tableId))
      ]);    }catch(e){
      console.error("Walk-in save failed:",e);
      const detail=String(e?.message||e||"Unknown database error");
      let conflicts=[];
      if(detail.includes("TABLE_TIME_CONFLICT")&&tableIds.length){
        const marks=tableIds.map(()=>"?").join(",");
        const found=await env.DB.prepare(
          "SELECT rt.table_id,r.guest_name,r.reservation_date,r.start_time,r.end_date,r.end_time,r.status " +
          "FROM reservation_tables rt JOIN reservations r ON r.id=rt.reservation_id " +
          "WHERE rt.table_id IN ("+marks+") AND r.status IN ('requested','confirmed','seated') " +
          "ORDER BY rt.table_id,r.reservation_date,r.start_time"
        ).bind(...tableIds).all();
        conflicts=found.results||[];
      }
      return json({
        error:detail.includes("THALI_HOURLY_LIMIT")
          ?"This would exceed the 12 Thali guests per hour limit."
          :"Walk-in could not be saved.",
        debug_error:detail,
        attempted_table_ids:tableIds,
        attempted_window:{reservation_date:date,start_time:time,end_date:end.date,end_time:end.time},
        conflicting_assignments:conflicts
      },409)
    }
    return json({ok:true,message:"Walk-in added and marked seated."},201);
  }
  if(url.pathname==="/api/availability" && req.method==="GET"){
    const date=url.searchParams.get("date"),party=Number(url.searchParams.get("party_size"));
    const thaliCount=Number(url.searchParams.get("thali_count")||0);
    if(!Number.isInteger(thaliCount)||thaliCount<0||thaliCount>party)
      return json({error:"thali_count must be between 0 and party_size."},400);
    if(!validDate(date)||isPastDate(date)||!Number.isInteger(party)||party<1||party>8)
      return json({error:"Choose today or a future date and a party size from 1 to 8."},400);
    const weekday=new Date(date+"T12:00:00Z").getUTCDay();
    if(weekday===1) return json({date,party_size:party,available_times:[],message:"Closed Mondays."});
    const isThursday=weekday===4;
    if(thaliCount>0&&!isThursday) return json({error:"Thali reservations are available on Thursdays only."},400);
    const tables=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1 ORDER BY id").all();
    const all=await assignedBookings(env.DB,date,date);
    const times=["17:00","17:30","18:00","18:30","19:00","19:30","20:00"];
    const now=pvDateTime();
    const available_times=[];
    const thali_remaining={};
    for(const t of times){
      if(date===now.date&&t<=now.time) continue;
      const duration=seatingDuration(party,t),end=addMinutes(date,t,duration);
      if(end.date!==date || end.time>"22:00") continue;
      if(isPrivateEventBlocked(date,t,end.date,end.time)) continue;
      if(!chooseTables(tables.results,all,date,t,end.date,end.time,party)) continue;
      if(isThursday&&thaliCount>0){
        const hour=t.slice(0,2);
        const used=await env.DB.prepare("SELECT COALESCE(SUM(thali_count),0) AS used FROM reservations WHERE reservation_date=? AND substr(start_time,1,2)=? AND status IN ('requested','confirmed','seated')").bind(date,hour).first();
        const remaining=thaliRemaining(used?.used||0);
        thali_remaining[hour]=remaining;
        if(exceedsThaliLimit(used?.used||0,thaliCount)) continue;
      }
      available_times.push(t);
    }
    return json({date,party_size:party,thali_count:thaliCount,available_times,
      thali_hourly_limit:isThursday?12:null,thali_remaining,kitchen_last_order:"21:30",
      note:"All reservations have 120-minute seating. Last available arrival is 8:00 pm; last kitchen order is at 9:30 pm."});
  }
  if(url.pathname==="/api/reservations" && req.method==="POST"){
    let body;try{body=await req.json();}catch{return json({error:"Invalid JSON."},400);}
    const {guest_name,phone,email,party_size,reservation_date,start_time,language="en",special_requests=null,birthday=null}=body||{};
    const party=Number(party_size),thaliCount=Number(body?.thali_count||0);
    if(!guest_name?.trim()||guest_name.trim().length>100||!phone?.trim()||phone.trim().length>40||!email?.trim()||email.trim().length>254||!/^\S+@\S+\.\S+$/.test(email.trim())||!Number.isInteger(party)||party<1||party>8||
       !Number.isInteger(thaliCount)||thaliCount<0||thaliCount>party||
       !validDate(reservation_date)||!validTime(start_time)||isPastArrival(reservation_date,start_time)||!validBirthday(birthday)||!["en","es"].includes(language)||String(special_requests||"").length>1000)
      return json({error:"Please provide valid guest details, date, time and party size (1–8)."},400);
    const weekday=weekdayForDate(reservation_date);
    if(weekday===1) return json({error:"Purpose is closed on Mondays."},400);
    if(thaliCount>0&&weekday!==4) return json({error:"Thali reservations are available on Thursdays only."},400);
    if(!isArrivalTime(start_time))
      return json({error:"Choose an arrival time between 5:00 pm and 8:00 pm."},400);
    const duration=seatingDuration(party,start_time),end=addMinutes(reservation_date,start_time,duration);
    if(isPrivateEventBlocked(reservation_date,start_time,end.date,end.time)) return json({error:"The restaurant is reserved for a private event until 6:30 pm. Please choose 6:30 pm or later."},409);
    if(end.date!==reservation_date||end.time>"22:00")
      return json({error:"Choose an available arrival time."},400);
    const tables=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1 ORDER BY id").all();
    const all=await assignedBookings(env.DB,reservation_date,end.date);
    const tableIds=chooseTables(tables.results,all,reservation_date,start_time,end.date,end.time,party);
    if(!tableIds) return json({error:"No table combination is available at that time. Please choose another time."},409);
    if(weekday===4&&thaliCount>0){
      const used=await env.DB.prepare("SELECT COALESCE(SUM(thali_count),0) AS used FROM reservations WHERE reservation_date=? AND substr(start_time,1,2)=? AND status IN ('requested','confirmed','seated')").bind(reservation_date,start_time.slice(0,2)).first();
      if(exceedsThaliLimit(used?.used||0,thaliCount)) return json({error:"Only 12 Thali guests are available in this hour. Please reduce the Thali count or choose another hour."},409);
    }
    const id=crypto.randomUUID(),code=crypto.randomUUID().slice(0,8).toUpperCase();
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO reservations
          (id,confirmation_code,guest_name,phone,email,birthday,party_size,thali_count,reservation_date,start_time,duration_minutes,end_date,end_time,status,source,language,special_requests)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'confirmed','online',?,?)`)
          .bind(id,code,guest_name.trim(),phone.trim(),email,birthday||null,party,thaliCount,reservation_date,start_time,duration,end.date,end.time,language,special_requests),
        ...tableIds.map(tableId=>env.DB.prepare("INSERT INTO reservation_tables (reservation_id,table_id) VALUES (?,?)").bind(id,tableId))
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
      const ownerPayload={guest_name:guest_name.trim(),guest_email:recipient,phone:phone.trim(),
        confirmation_code:code,reservation_date,start_time,party_size:party,thali_count:thaliCount,
        special_requests,language};
      const guestSend=(async()=>{
        try{
          const mailResult=await sendZohoConfirmation(env,emailPayload);
          const status=mailResult.status==="sent"?"sent":mailResult.status==="suppressed"?"not_requested":"failed";
          const error=status==="sent"?null:status==="not_requested"?"Email delivery disabled in isolated test environment":"Zoho credentials are not configured";
          await env.DB.prepare("UPDATE reservations SET email_status=?,email_error=?,email_sent_at=CASE WHEN ?='sent' THEN CURRENT_TIMESTAMP ELSE email_sent_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(status,error,status,id).run();
        }catch(e){
          await env.DB.prepare("UPDATE reservations SET email_status='failed',email_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(String(e?.message||"EMAIL_SEND_FAILED").slice(0,120),id).run();
        }
      })();
      const ownerSend=(async()=>{
        try{ await sendZohoMail(env,"info@purposepv.com",ownerNotificationEmail(ownerPayload)); }
        catch(e){ console.error("OWNER_NOTIFICATION_FAILED",String(e?.message||e)); }
      })();
      await Promise.all([guestSend,ownerSend]);
    };
    if(ctx?.waitUntil) ctx.waitUntil(sendAndRecord());
    else await sendAndRecord();
    return json({ok:true,confirmation_code:code,date:reservation_date,start_time,end_time:end.time,duration_minutes:duration,
      thali_count:thaliCount,alacarte_count:party-thaliCount,email_status:env.SUPPRESS_EMAILS==="true"?"not_requested":"queued",
      kitchen_last_order:"21:30",guest_note:language==="es"?"Última orden de cocina a las 9:30 pm.":"Last kitchen order at 9:30 pm."},201);
  }
  if(url.pathname.startsWith("/api/reservations/")&&req.method==="PATCH"){
    if(!await isAdmin(req,env)) return json({error:"Unauthorized"},401);
    if(!sameOrigin(req))return json({error:"Invalid origin."},403);
    const id=url.pathname.split("/").pop();
    if(!id || id.includes("/")) return json({error:"Invalid reservation id."},400);
    let body;try{body=await req.json();}catch{return json({error:"Invalid JSON."},400);}
    const allowed=["confirmed","seated","completed","cancelled","no_show"];
    if(body.status!==undefined&&!allowed.includes(body.status)) return json({error:"Invalid status."},400);
    if(body.internal_notes!==undefined && String(body.internal_notes).length>2000)
      return json({error:"Internal notes must be 2,000 characters or fewer."},400);
    const current=await env.DB.prepare("SELECT id,party_size,status FROM reservations WHERE id=?").bind(id).first();
    if(!current) return json({error:"Reservation not found."},404);
    const statements=[];
    if(body.status!==undefined)
      statements.push(env.DB.prepare("UPDATE reservations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.status,id));
    if(body.internal_notes!==undefined)
      statements.push(env.DB.prepare("UPDATE reservations SET internal_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(body.internal_notes),id));
    if(body.table_ids!==undefined){
      const activeTables=await env.DB.prepare("SELECT id,capacity FROM dining_tables WHERE is_active=1").all();
      const validation=validateTableSelection(body.table_ids,activeTables.results,current.party_size);
      if(!validation.ok){
        if(validation.reason==="insufficient_capacity") return json({error:"The selected active tables do not have enough seats."},409);
        if(validation.reason==="inactive_or_unknown_table") return json({error:"One or more selected tables are inactive or unavailable."},409);
        return json({error:"table_ids must be a unique list of table numbers 1–9."},400);
      }
      statements.push(env.DB.prepare("DELETE FROM reservation_tables WHERE reservation_id=?").bind(id));
      for(const tableId of body.table_ids)
        statements.push(env.DB.prepare("INSERT INTO reservation_tables (reservation_id,table_id) VALUES (?,?)").bind(id,tableId));
    }
    try{
      if(statements.length) await env.DB.batch(statements);
    }catch(e){
      if(String(e).includes("TABLE_TIME_CONFLICT")) return json({error:"That table is already assigned to an overlapping reservation."},409);
      if(String(e).includes("THALI_HOURLY_LIMIT")) return json({error:"This change would exceed the 12 Thali guests per hour limit."},409);
      throw e;
    }
    const r=await env.DB.prepare("SELECT id,confirmation_code,guest_name,party_size,reservation_date,start_time,duration_minutes,end_date,end_time,status FROM reservations WHERE id=?").bind(id).first();
    return json({reservation:r});
  }
  return json({error:"Not found."},404);
 }
};
