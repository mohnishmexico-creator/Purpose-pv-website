import { chromium } from "playwright";
const base=process.env.TEST_BASE_URL;
if(!base) throw new Error("TEST_BASE_URL is required");
const d=new Date();const delta=((4-d.getUTCDay()+7)%7)||7;d.setUTCDate(d.getUTCDate()+delta);
const thursday=d.toISOString().slice(0,10);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(base,{waitUntil:"networkidle"});
 if(!(await page.title()).includes("Purpose PV")) throw new Error("Guest page title missing");
 const arrivals=await page.locator("#time option").evaluateAll(nodes=>nodes.map(n=>n.value));
 if(arrivals.at(-1)!=="20:00"||arrivals.includes("20:30")||arrivals.includes("21:00")) throw new Error("Guest arrival options must end at 8 pm");
 const duration=await page.locator("#duration").innerText();
 if(!duration.includes("120 minutes")||duration.includes("90 minutes")) throw new Error("Guest page must state 120-minute seating for all parties");
 await page.locator("#date").fill(thursday);
 await page.locator("#party").selectOption("3");
 if(await page.locator("#thaliField").isHidden()) throw new Error("Thursday Thali selector should be visible");
 await page.getByRole("button",{name:"Español"}).click();
 if(!(await page.locator("#guestTitle").innerText()).includes("Reservar")) throw new Error("Spanish guest UI did not switch");
 const spanishDuration=await page.locator("#duration").innerText();
 if(!spanishDuration.includes("120 minutos")||spanishDuration.includes("90 minutos")) throw new Error("Spanish page must state 120-minute seating");
 const spanishThali=await page.locator("#thaliTitle").innerText();console.log("Observed Spanish Thali title: "+JSON.stringify(spanishThali));if(!spanishThali.includes("Jueves")) throw new Error("Spanish Thali labels did not switch: "+spanishThali);
 await page.getByRole("button",{name:"English"}).click();
 if(!(await page.locator("#thaliTitle").innerText()).includes("Thursday")) throw new Error("English Thali labels did not switch");
 await page.goto(base+"/staff",{waitUntil:"networkidle"});
 if(await page.locator("#login").isHidden()) throw new Error("Staff login screen should be visible");
 if(await page.locator("#dashboard").isVisible()) throw new Error("Staff dashboard must stay hidden before login");
 if(await page.locator("#phoneForm").count()!==1||await page.locator("#walkinForm").count()!==1) throw new Error("Staff phone booking and walk-in forms are missing");
 for(const selector of ["#phTime","#wiTime"]){
  const options=await page.locator(selector+" option").evaluateAll(nodes=>nodes.map(n=>n.value));
  if(options.at(-1)!=="20:00"||options.includes("20:30")||options.includes("21:00")) throw new Error("Staff booking times must end at 8 pm");
 }
 console.log("PASS Playwright guest mobile layout, Thursday Thali UI, English/Spanish switching, staff login gate, and staff booking forms");
}finally{await browser.close()}
