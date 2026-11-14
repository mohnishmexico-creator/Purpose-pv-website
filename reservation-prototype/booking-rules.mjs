export function seatingDuration(party,time){
  if(time==="21:00") return party<=3?60:90;
  return party<=3?90:120;
}
export function weekdayForDate(date){
  return new Date(date+"T12:00:00Z").getUTCDay();
}
export function isArrivalTime(time){
  if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time||"")) return false;
  return time>="17:00"&&time<="21:00"&&Number(time.slice(3,5))%30===0;
}
