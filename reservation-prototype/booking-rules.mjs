export function seatingDuration(party,time){
  return 120;
}
export function weekdayForDate(date){
  return new Date(date+"T12:00:00Z").getUTCDay();
}
export function isArrivalTime(time){
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time||"")) return false;
  return time>="17:00"&&time<="20:00"&&Number(time.slice(3,5))%30===0;
}

export function isBeyondBookingWindow(date,today,maxDays=28){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||"")||!/^\d{4}-\d{2}-\d{2}$/.test(today||"")) return true;
  const target=Date.parse(date+"T12:00:00Z"),start=Date.parse(today+"T12:00:00Z");
  if(!Number.isFinite(target)||!Number.isFinite(start)) return true;
  const days=(target-start)/86400000;
  return days<0||days>maxDays;
}
