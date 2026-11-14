import test from "node:test";
import assert from "node:assert/strict";
import { chooseTables, overlaps } from "../allocation.mjs";

const tables=[
  {id:1,capacity:8},{id:2,capacity:4},{id:3,capacity:4},
  {id:4,capacity:2},{id:5,capacity:4},{id:6,capacity:2},
  {id:7,capacity:4},{id:8,capacity:2},{id:9,capacity:6}
];
const date="2026-11-19";
const booking=(table_id,start_time,end_time)=>({
  table_id,reservation_date:date,start_time,end_date:date,end_time
});

test("chooses one table when it fits",()=>{
  assert.deepEqual(chooseTables(tables,[],date,"18:00",date,"20:00",6),[1]);
});
test("combines tables when no single table fits",()=>{
  assert.deepEqual(chooseTables(tables,[],date,"18:00",date,"20:00",10),[2,3,9]);
});
test("avoids tables occupied during any part of the requested interval",()=>{
  const occupied=[booking(1,"19:00","21:00")];
  assert.deepEqual(chooseTables(tables,occupied,date,"18:00",date,"20:00",8),[2,3]);
});
test("allows a table when the existing booking ends exactly at arrival",()=>{
  const occupied=[booking(1,"17:00","18:00")];
  assert.deepEqual(chooseTables(tables,occupied,date,"18:00",date,"20:00",8),[1]);
});
test("does not allow a table when intervals overlap by one minute",()=>{
  const occupied=[booking(1,"17:00","18:01")];
  assert.notDeepEqual(chooseTables(tables,occupied,date,"18:00",date,"20:00",8),[1]);
});
test("returns null when remaining tables cannot seat the party",()=>{
  const occupied=tables.filter(t=>t.id!==1).map(t=>booking(t.id,"17:00","21:00"));
  assert.equal(chooseTables(tables,occupied,date,"18:00",date,"20:00",8),null);
});
test("prefers fewer tables when capacity is equal",()=>{
  const options=[{id:1,capacity:4},{id:2,capacity:2},{id:3,capacity:2}];
  assert.deepEqual(chooseTables(options,[],date,"18:00",date,"20:00",4),[1]);
});
test("uses stable table order to break equal-capacity ties",()=>{
  const options=[{id:3,capacity:4},{id:2,capacity:4}];
  assert.deepEqual(chooseTables(options,[],date,"18:00",date,"20:00",4),[2]);
});
test("overlap uses half-open intervals",()=>{
  assert.equal(overlaps(date,"17:00",date,"18:00",date,"18:00",date,"19:00"),false);
  assert.equal(overlaps(date,"17:00",date,"18:01",date,"18:00",date,"19:00"),true);
});
