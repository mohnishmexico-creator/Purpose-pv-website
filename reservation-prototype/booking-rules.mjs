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
