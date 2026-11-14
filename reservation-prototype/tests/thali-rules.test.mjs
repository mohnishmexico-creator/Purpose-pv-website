import test from "node:test";
import assert from "node:assert/strict";
import { thaliRemaining, exceedsThaliLimit, THALI_HOURLY_LIMIT } from "../thali-rules.mjs";

test("hourly Thali capacity is 12 guests",()=>{
  assert.equal(THALI_HOURLY_LIMIT,12);
});
test("allows exactly 12 Thali guests in an hour",()=>{
  assert.equal(exceedsThaliLimit(0,12),false);
  assert.equal(thaliRemaining(0),12);
});
test("rejects a booking that would exceed 12",()=>{
  assert.equal(exceedsThaliLimit(9,4),true);
  assert.equal(thaliRemaining(9),3);
});
test("allows remaining capacity exactly",()=>{
  assert.equal(exceedsThaliLimit(8,4),false);
  assert.equal(thaliRemaining(8),4);
});
test("does not offer negative remaining capacity",()=>{
  assert.equal(thaliRemaining(15),0);
  assert.equal(exceedsThaliLimit(15,1),true);
});
