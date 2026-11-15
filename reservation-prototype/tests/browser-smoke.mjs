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
 await page.locator("#date").fill(thursday);
 await page.locator("#party").selectOption("3");
 if(await page.locator("#thaliField").isHidden()) throw new Error("Thursday Thali selector should be visible");
 await page.getByRole("button",{name:"Español"}).click();
 if(!(await page.locator("#guestTitle").innerText()).includes("Reservar")) throw new Error("Spanish guest UI did not switch");
 const spanishThali=await page.locator("#thaliTitle").innerText();console.log("Observed Spanish Thali title: "+JSON.stringify(spanishThali));if(!spanishThali.includes("Jueves")) throw new Error("Spanish Thali labels did not switch: "+spanishThali);
 await page.getByRole("button",{name:"English"}).click();
 if(!(await page.locator("#thaliTitle").innerText()).includes("Thursday")) throw new Error("English Thali labels did not switch");
 await page.goto(base+"/staff",{waitUntil:"networkidle"});
 if(await page.locator("#login").isHidden()) throw new Error("Staff login screen should be visible");
 if(await page.locator("#dashboard").isVisible()) throw new Error("Staff dashboard must stay hidden before login");
 console.log("PASS Playwright guest mobile layout, Thursday Thali UI, English/Spanish switching, and staff login gate");
}finally{await browser.close()}
