"use client";

import { useMemo, useState } from "react";
import type { CalendarMonth } from "@/lib/fantasy-calendar";

export function CalendarCurrentDateInput({months,currentMonth,currentDay,currentYear,currentEra,hasYearZero,beforeEraLabel,afterEraLabel}:{months:CalendarMonth[];currentMonth:number;currentDay:number;currentYear:number;currentEra:"before"|"after";hasYearZero:boolean;beforeEraLabel:string;afterEraLabel:string}){
  const ordered=useMemo(()=>[...months].sort((a,b)=>a.sortOrder-b.sortOrder),[months]);
  const [month,setMonth]=useState(Math.min(Math.max(1,currentMonth),Math.max(1,ordered.length)));
  const selected=ordered[month-1]??ordered[0];
  const dayCount=Math.max(1,selected?.days??1);
  const [day,setDay]=useState(Math.min(Math.max(1,currentDay),dayCount));
  const selectMonth=(next:number)=>{const safe=Math.min(Math.max(1,next),Math.max(1,ordered.length));const nextDays=Math.max(1,ordered[safe-1]?.days??1);setMonth(safe);setDay((current)=>Math.min(current,nextDays));};
  return <div className="field-grid two">
    <label>Aktuelle Ära<select name="currentEra" defaultValue={currentEra}><option value="before">{beforeEraLabel}</option><option value="after">{afterEraLabel}</option></select></label>
    <label>Aktuelles Jahr<input name="currentYear" type="number" min={hasYearZero?0:1} step="1" defaultValue={currentYear} required/></label>
    <label>Aktueller Monat<select name="currentMonth" value={month} onChange={(event)=>selectMonth(Number(event.target.value))} required>{ordered.map((item,index)=><option key={item.monthId??item.sortOrder} value={index+1}>{item.name}</option>)}</select></label>
    <label>Aktueller Tag<select name="currentDay" value={day} onChange={(event)=>setDay(Number(event.target.value))} required>{Array.from({length:dayCount},(_,index)=>index+1).map((value)=><option key={value} value={value}>{value}</option>)}</select><small className="form-field-hint">{selected?`${selected.name}: ${dayCount} Tage`:"Monat auswählen"}</small></label>
  </div>;
}
