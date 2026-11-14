export const THALI_HOURLY_LIMIT = 12;
export function thaliRemaining(used){
  return Math.max(0,THALI_HOURLY_LIMIT-Math.max(0,Number(used)||0));
}
export function exceedsThaliLimit(used,requested){
  return Math.max(0,Number(used)||0)+Math.max(0,Number(requested)||0)>THALI_HOURLY_LIMIT;
}
