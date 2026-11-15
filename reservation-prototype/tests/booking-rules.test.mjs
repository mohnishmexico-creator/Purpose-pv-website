import test from "node:test";
import assert from "node:assert/strict";
import { seatingDuration, weekdayForDate, isArrivalTime, isBeyondBookingWindow } from "../booking-rules.mjs";

test("all parties receive 120-minute seating",()=>{
  for(const party of [1,2,3,4,5,6,7,8]) assert.equal(seatingDuration(party,"17:00"),120);
  assert.equal(seatingDuration(2,"20:00"),120);
  assert.equal(seatingDuration(8,"20:00"),120);
});
test("arrival times are half-hour slots from 5 pm through 8 pm",()=>{
  for(const t of ["17:00","17:30","18:00","18:30","19:00","19:30","20:00"])
    assert.equal(isArrivalTime(t),true,t);
  for(const t of ["16:30","17:15","20:30","20:45","21:00","21:30","22:00","bad"])
    assert.equal(isArrivalTime(t),false,t);
});
test("weekday calculation uses the supplied calendar date",()=>{
  assert.equal(weekdayForDate("2026-11-16"),1);
  assert.equal(weekdayForDate("2026-11-19"),4);
  assert.equal(weekdayForDate("2026-11-15"),0);
});

test("booking window allows today through 28 days ahead and rejects day 29",()=>{
  assert.equal(isBeyondBookingWindow("2026-11-15","2026-11-15"),false);
  assert.equal(isBeyondBookingWindow("2026-12-13","2026-11-15"),false);
  assert.equal(isBeyondBookingWindow("2026-12-14","2026-11-15"),true);
  assert.equal(isBeyondBookingWindow("2026-11-14","2026-11-15"),true);
  assert.equal(isBeyondBookingWindow("not-a-date","2026-11-15"),true);
});
