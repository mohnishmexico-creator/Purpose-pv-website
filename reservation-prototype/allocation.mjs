export function overlaps(aDate,aStart,aEndDate,aEnd,bDate,bStart,bEndDate,bEnd){
  const a0=Date.parse(aDate+"T"+aStart+"Z"),a1=Date.parse(aEndDate+"T"+aEnd+"Z");
  const b0=Date.parse(bDate+"T"+bStart+"Z"),b1=Date.parse(bEndDate+"T"+bEnd+"Z");
  return a0<b1 && b0<a1;
}

export function chooseTables(tables,bookings,date,start,endDate,endTime,party){
  const free=tables.filter(t=>!bookings.some(b=>Number(b.table_id)===Number(t.id)&&
    overlaps(date,start,endDate,endTime,b.reservation_date,b.start_time,b.end_date,b.end_time)));
  const suitable=free
    .filter(t=>Number(t.capacity)>=Number(party))
    .sort((a,b)=>Number(a.capacity)-Number(b.capacity)||Number(a.id)-Number(b.id));
  return suitable.length?[Number(suitable[0].id)]:null;
}
