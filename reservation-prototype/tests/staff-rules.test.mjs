import test from "node:test";
import assert from "node:assert/strict";
import { validateTableSelection } from "../staff-rules.mjs";
const tables=[{id:1,capacity:8},{id:2,capacity:4},{id:3,capacity:4},{id:4,capacity:2},{id:5,capacity:4},{id:6,capacity:2},{id:7,capacity:4},{id:8,capacity:2},{id:9,capacity:6}];
test("accepts a valid assignment with enough seats",()=>{
  assert.deepEqual(validateTableSelection([1],tables,8),{ok:true,seats:8});
  assert.deepEqual(validateTableSelection([2,9],tables,10),{ok:true,seats:10});
});
test("rejects an assignment with insufficient capacity",()=>{
  assert.equal(validateTableSelection([2],tables,5).reason,"insufficient_capacity");
});
test("rejects empty, duplicate, and out-of-range table selections",()=>{
  for(const ids of [[],[1,1],[0],[10]]) assert.equal(validateTableSelection(ids,tables,1).ok,false);
});
test("rejects inactive or unknown tables",()=>{
  assert.equal(validateTableSelection([3],[...tables.filter(t=>t.id!==3)],2).reason,"inactive_or_unknown_table");
});
