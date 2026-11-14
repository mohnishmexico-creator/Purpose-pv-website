export function overlaps(aDate,aStart,aEndDate,aEnd,bDate,bStart,bEndDate,bEnd){
  const a0=Date.parse(aDate+"T"+aStart+"Z"),a1=Date.parse(aEndDate+"T"+aEnd+"Z");
  const b0=Date.parse(bDate+"T"+bStart+"Z"),b1=Date.parse(bEndDate+"T"+bEnd+"Z");
  return a0<b1 && b0<a1;
}

export function chooseTables(tables,bookings,date,start,endDate,endTime,party){
  const free=tables.filter(t=>!bookings.some(b=>Number(b.table_id)===Number(t.id)&&
    overlaps(date,start,endDate,endTime,b.reservation_date,b.start_time,b.end_date,b.end_time)));
  let best=null;
  for(let mask=1;mask<(1<<free.length);mask++){
    let seats=0,ids=[];
    for(let i=0;i<free.length;i++) if(mask&(1<<i)){seats+=Number(free[i].capacity);ids.push(Number(free[i].id));}
    if(seats<party) continue;
    ids.sort((a,b)=>a-b);
    if(!best||seats<best.seats||(seats===best.seats&&ids.length<best.ids.length)||
      (seats===best.seats&&ids.length===best.ids.length&&ids.join(",")<best.ids.join(",")))
      best={seats,ids};
  }
  return best?.ids||null;
}
