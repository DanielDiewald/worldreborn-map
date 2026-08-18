import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFantasyAge,
  calendarDayTotal,
  fantasyDateToOrdinal,
  formatFantasyDate,
  ordinalToFantasyDate,
  validateCalendar,
  validateFantasyDate,
  type FantasyCalendar,
} from "../src/lib/fantasy-calendar";

function calendar(overrides:Partial<FantasyCalendar>={}):FantasyCalendar{
  return {
    calendarId:1,projectId:1,name:"Imperialer Kalender",daysPerYear:360,hasYearZero:false,beforeEraLabel:"v.K.",afterEraLabel:"n.K.",
    currentEra:"after",currentYear:20,currentMonth:1,currentDay:1,currentWorldDay:null,
    months:Array.from({length:12},(_,index)=>({monthId:index+1,sortOrder:index+1,name:`Mond ${index+1}`,days:30})),
    ...overrides,
  };
}

test("custom fantasy months validate and sum to the configured year",()=>{
  const c=calendar({daysPerYear:100,months:[{sortOrder:1,name:"Frost",days:20},{sortOrder:2,name:"Flut",days:35},{sortOrder:3,name:"Glut",days:45}]});
  assert.equal(calendarDayTotal(c),100);
  assert.deepEqual(validateCalendar(c),[]);
  assert.equal(formatFantasyDate({era:"after",year:7,month:2,day:31,precision:"exact_day"},c),"31. Flut 7 n.K.");
});

test("invalid fantasy days are rejected against the selected month length",()=>{
  const c=calendar({daysPerYear:50,months:[{sortOrder:1,name:"Kurzmond",days:20},{sortOrder:2,name:"Langmond",days:30}]});
  const errors=validateFantasyDate({era:"after",year:3,month:1,day:21,precision:"exact_day"},c);
  assert.ok(errors.some((error)=>error.includes("20 Tage")));
});

test("ordinal roundtrip works across the before/after epoch without year zero",()=>{
  const c=calendar();
  const samples=[
    {era:"before" as const,year:2,month:12,day:30,precision:"exact_day" as const},
    {era:"before" as const,year:1,month:12,day:30,precision:"exact_day" as const},
    {era:"after" as const,year:1,month:1,day:1,precision:"exact_day" as const},
    {era:"after" as const,year:4,month:7,day:13,precision:"exact_day" as const},
  ];
  for(const value of samples){const ordinal=fantasyDateToOrdinal(value,c);assert.notEqual(ordinal,null);const round=ordinalToFantasyDate(ordinal!,c);assert.deepEqual(round,value);}
  assert.equal(fantasyDateToOrdinal({era:"after",year:1,month:1,day:1,precision:"exact_day"},c),0);
  assert.equal(fantasyDateToOrdinal({era:"before",year:1,month:12,day:30,precision:"exact_day"},c),-1);
});

test("year zero is supported only when the calendar explicitly enables it",()=>{
  const without=calendar({hasYearZero:false});
  assert.ok(validateFantasyDate({era:"after",year:0,precision:"year"},without).some((error)=>error.includes("kein Jahr 0")));
  const withZero=calendar({hasYearZero:true,currentYear:0});
  assert.deepEqual(validateFantasyDate({era:"after",year:0,precision:"year"},withZero),[]);
  assert.equal(formatFantasyDate({era:"after",year:0,precision:"year"},withZero),"0");
});

test("exact and approximate ages use the fantasy year length and preserve uncertainty",()=>{
  const c=calendar({currentYear:20,currentMonth:1,currentDay:1});
  const exact=calculateFantasyAge({era:"after",year:10,month:1,day:1,precision:"exact_day"},c);
  assert.equal(exact?.label,"10 Jahre");
  const yearOnly=calculateFantasyAge({era:"after",year:10,precision:"year"},c);
  assert.equal(yearOnly?.min,9);
  assert.equal(yearOnly?.max,10);
  assert.match(yearOnly?.label??"",/ca\. 9–10 Jahre/);
  const approximate=calculateFantasyAge({era:"after",year:10,precision:"approximate_year"},c);
  assert.equal(approximate?.source,"approximate");
  assert.match(approximate?.label??"",/^ca\./);
});
