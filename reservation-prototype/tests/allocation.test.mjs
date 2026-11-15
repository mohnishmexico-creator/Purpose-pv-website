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

test("chooses the smallest suitable single table",()=>{
  assert.deepEqual(chooseTables(tables,[],date,"18:00",date,"20:00",6),[9]);
});
test("does not combine tables when no single table fits",()=>{
  assert.equal(chooseTables(tables,[],date,"18:00",date,"20:00",10),null);
});
test("does not combine free tables when the only suitable table is occupied",()=>{
  const occupied=[booking(1,"17:00","21:00")];
  assert.equal(chooseTables(tables,occupied,date,"18:00",date,"20:00",8),null);
});
test("allows a table when the existing booking ends exactly at arrival",()=>{
  const occupied=[booking(1,"17:00","18:00")];
  assert.deepEqual(chooseTables(tables,occupied,date,"18:00",date,"20:00",8),[1]);
});
test("does not allow a table when intervals overlap by one minute",()=>{
  const occupied=[booking(1,"17:00","18:01")];
  assert.equal(chooseTables(tables,occupied,date,"18:00",date,"20:00",8),null);
});
test("returns null when all suitable tables are occupied",()=>{
  const occupied=tables.map(t=>booking(t.id,"17:00","21:00"));
  assert.equal(chooseTables(tables,occupied,date,"18:00",date,"20:00",8),null);
});
test("chooses the smallest table that fits the party",()=>{
  const options=[{id:1,capacity:8},{id:9,capacity:6},{id:2,capacity:4},{id:3,capacity:4}];
  assert.deepEqual(chooseTables(options,[],date,"18:00",date,"20:00",4),[2]);
});
test("uses stable table order to break equal-capacity ties",()=>{
  const options=[{id:3,capacity:4},{id:2,capacity:4}];
  assert.deepEqual(chooseTables(options,[],date,"18:00",date,"20:00",4),[2]);
});
test("selects the next suitable table when the smallest one is occupied",()=>{
  const options=[{id:2,capacity:4},{id:3,capacity:4},{id:1,capacity:8}];
  const occupied=[booking(2,"17:00","21:00")];
  assert.deepEqual(chooseTables(options,occupied,date,"18:00",date,"20:00",4),[3]);
});
test("overlap uses half-open intervals",()=>{
  assert.equal(overlaps(date,"17:00",date,"18:00",date,"18:00",date,"19:00"),false);
  assert.equal(overlaps(date,"17:00",date,"18:01",date,"18:00",date,"19:00"),true);
});
