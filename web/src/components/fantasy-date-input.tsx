"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarMonth, FantasyDate, FantasyDatePrecision } from "@/lib/fantasy-calendar";

type Props = {
  prefix: string;
  months: CalendarMonth[];
  beforeEraLabel: string;
  afterEraLabel: string;
  hasYearZero: boolean;
  value?: FantasyDate | null;
  label?: string;
  allowUnknown?: boolean;
};

const PRECISIONS: Array<{ value: FantasyDatePrecision; label: string }> = [
  { value: "exact_day", label: "Exaktes Datum" },
  { value: "month", label: "Monat bekannt" },
  { value: "year", label: "Jahr bekannt" },
  { value: "approximate_year", label: "Ungefähres Jahr" },
  { value: "unknown", label: "Unbekannt" },
];

export function FantasyDateInput({ prefix, months, beforeEraLabel, afterEraLabel, hasYearZero, value, label = "Fantasy-Datum", allowUnknown = true }: Props) {
  const ordered = useMemo(() => [...months].sort((a, b) => a.sortOrder - b.sortOrder), [months]);
  const [precision, setPrecision] = useState<FantasyDatePrecision>(value?.precision ?? (allowUnknown ? "unknown" : "exact_day"));
  const [month, setMonth] = useState<number>(() => {
    const candidate = value?.month ?? 1;
    return Math.min(Math.max(1, candidate), Math.max(1, months.length));
  });
  const selected = ordered[month - 1] ?? ordered[0];
  const dayCount = selected?.days ?? 1;
  const [day, setDay] = useState<number>(() => Math.min(Math.max(1, value?.day ?? 1), dayCount));
  const showMonth = precision === "exact_day" || precision === "month";
  const showDay = precision === "exact_day";
  const disabled = precision === "unknown";

  useEffect(() => {
    setDay((current) => Math.min(Math.max(1, current), dayCount));
  }, [dayCount]);

  return <fieldset className="fantasy-date-fieldset">
    <legend>{label}</legend>
    <div className="field-grid two">
      <label>Genauigkeit
        <select name={`${prefix}Precision`} value={precision} onChange={(event) => setPrecision(event.target.value as FantasyDatePrecision)}>
          {PRECISIONS.filter((item) => allowUnknown || item.value !== "unknown").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label>Ära
        <select name={`${prefix}Era`} defaultValue={value?.era ?? "after"} disabled={disabled}>
          <option value="before">{beforeEraLabel}</option><option value="after">{afterEraLabel}</option>
        </select>
      </label>
      <label>Jahr
        <input name={`${prefix}Year`} type="number" min={hasYearZero ? 0 : 1} step="1" defaultValue={value?.year ?? (hasYearZero ? 0 : 1)} disabled={disabled}/>
      </label>
      {showMonth ? <label>Monat
        <select name={`${prefix}Month`} value={month} onChange={(event) => setMonth(Number(event.target.value))}>
          {ordered.map((item, index) => <option key={item.monthId ?? item.sortOrder} value={index + 1}>{item.name}</option>)}
        </select>
      </label> : <input type="hidden" name={`${prefix}Month`} value=""/>}
      {showDay ? <label>Tag
        <select name={`${prefix}Day`} value={day} onChange={(event)=>setDay(Number(event.target.value))}>
          {Array.from({ length: dayCount }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label> : <input type="hidden" name={`${prefix}Day`} value=""/>}
    </div>
    {precision === "year" || precision === "approximate_year" ? <p className="section-help">Monat und Tag werden beim Speichern ausdrücklich entfernt, damit keine alten Detailwerte unsichtbar weiterleben.</p> : null}
    {precision === "month" ? <p className="section-help">Der Tag wird beim Speichern ausdrücklich entfernt.</p> : null}
    {disabled ? <p className="section-help">Kein Datum gespeichert. Legacy-Alter bleibt unverändert erhalten.</p> : null}
  </fieldset>;
}
