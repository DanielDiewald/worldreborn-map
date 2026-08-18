"use client";

import { useState } from "react";
import { DEATH_CAUSE_OPTIONS } from "@/lib/death-causes";
import type { CalendarMonth, FantasyDate } from "@/lib/fantasy-calendar";
import { FantasyDateInput } from "./fantasy-date-input";

type CalendarConfig = {
  months: CalendarMonth[];
  beforeEraLabel: string;
  afterEraLabel: string;
  hasYearZero: boolean;
};

type Props = {
  defaultAlive: boolean;
  calendar?: CalendarConfig | null;
  deathDate?: FantasyDate | null;
  deathCauseCode?: string | null;
  deathCauseDetail?: string | null;
};

export function CharacterLifeStatusInput({
  defaultAlive,
  calendar,
  deathDate,
  deathCauseCode,
  deathCauseDetail,
}: Props) {
  const [alive, setAlive] = useState(defaultAlive);

  return <div className="stack">
    <label><input name="alive" type="checkbox" checked={alive} onChange={(event) => setAlive(event.target.checked)}/> Lebendig</label>
    {!alive ? <div className="stack">
      <div className="notice warning"><strong>Verstorben</strong><span> Todesdatum und Todesursache sind optional. Wenn du die Person wieder als lebendig markierst, werden beide Angaben beim Speichern entfernt.</span></div>
      {calendar ? <FantasyDateInput prefix="death" label="Todesdatum (optional)" months={calendar.months} beforeEraLabel={calendar.beforeEraLabel} afterEraLabel={calendar.afterEraLabel} hasYearZero={calendar.hasYearZero} value={deathDate}/> : <p className="section-help">Ein Fantasy-Todesdatum kann gepflegt werden, sobald der Weltkalender gültig konfiguriert ist.</p>}
      <div className="field-grid two">
        <label>Todesursache (optional)
          <select name="deathCauseCode" defaultValue={deathCauseCode ?? ""}>
            <option value="">Keine Angabe</option>
            {DEATH_CAUSE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>Details / Ergänzung (optional)
          <input name="deathCauseDetail" maxLength={1000} defaultValue={deathCauseDetail ?? ""} placeholder="z. B. während der Schlacht von …"/>
        </label>
      </div>
    </div> : null}
  </div>;
}
