import test from "node:test";
import assert from "node:assert/strict";
import { seatingDuration, weekdayForDate, isArrivalTime } from "../booking-rules.mjs";

test("1–3 guests receive 90 minutes except 9 pm",()=>{
  assert.equal(seatingDuration(1,"17:00"),90);
  assert.equal(seatingDuration(3,"20:30"),90);
  assert.equal(seatingDuration(3,"21:00"),60);
});
test("4–8 guests receive 120 minutes except 9 pm",()=>{
  assert.equal(seatingDuration(4,"17:00"),120);
  assert.equal(seatingDuration(8,"20:30"),120);
  assert.equal(seatingDuration(8,"21:00"),90);
});
test("arrival times are half-hour slots from 5 pm through 9 pm",()=>{
  for(const t of ["17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00"])
    assert.equal(isArrivalTime(t),true,t);
  for(const t of ["16:30","17:15","20:45","21:30","22:00","bad"])
    assert.equal(isArrivalTime(t),false,t);
});
test("weekday calculation uses the supplied calendar date",()=>{
  assert.equal(weekdayForDate("2026-11-16"),1);
  assert.equal(weekdayForDate("2026-11-19"),4);
  assert.equal(weekdayForDate("2026-11-15"),0);
});
