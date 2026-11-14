export function validateTableSelection(tableIds, activeTables, partySize){
  if(!Array.isArray(tableIds)||tableIds.length<1||
    tableIds.some(x=>!Number.isInteger(x)||x<1||x>9)||
    new Set(tableIds).size!==tableIds.length)
    return {ok:false,reason:"invalid_selection"};
  const selected=activeTables.filter(t=>tableIds.includes(Number(t.id)));
  if(selected.length!==tableIds.length)
    return {ok:false,reason:"inactive_or_unknown_table"};
  const seats=selected.reduce((sum,t)=>sum+Number(t.capacity||0),0);
  if(seats<Number(partySize))
    return {ok:false,reason:"insufficient_capacity"};
  return {ok:true,seats};
}
