import assert from "node:assert/strict";
import test from "node:test";
import { DEATH_CAUSE_OPTIONS, deathCauseLabel, parseDeathCauseCode } from "../src/lib/death-causes";
import { calculateFantasyAge, type FantasyCalendar, type FantasyDate } from "../src/lib/fantasy-calendar";

const calendar: FantasyCalendar = {
  calendarId: 1,
  projectId: 1,
  name: "Testkalender",
  daysPerYear: 360,
  hasYearZero: false,
  beforeEraLabel: "v.Z.",
  afterEraLabel: "n.Z.",
  currentEra: "after",
  currentYear: 100,
  currentMonth: 1,
  currentDay: 1,
  currentWorldDay: null,
  months: Array.from({ length: 12 }, (_, index) => ({ sortOrder: index + 1, name: `Monat ${index + 1}`, days: 30 })),
};

test("all death cause presets round-trip and expose a label", () => {
  for (const option of DEATH_CAUSE_OPTIONS) {
    assert.equal(parseDeathCauseCode(option.value), option.value);
    assert.equal(deathCauseLabel(option.value), option.label);
  }
});

test("death cause remains optional and rejects unknown codes", () => {
  assert.equal(parseDeathCauseCode(""), null);
  assert.equal(parseDeathCauseCode(null), null);
  assert.equal(parseDeathCauseCode("not-a-real-cause"), null);
  assert.equal(deathCauseLabel("not-a-real-cause"), null);
});

test("a deceased character's age is calculated at the fantasy death date", () => {
  const birth: FantasyDate = { era: "after", year: 10, month: 1, day: 1, precision: "exact_day" };
  const death: FantasyDate = { era: "after", year: 40, month: 1, day: 1, precision: "exact_day" };
  const age = calculateFantasyAge(birth, calendar, death);
  assert.equal(age?.min, 30);
  assert.equal(age?.max, 30);
  assert.equal(age?.label, "30 Jahre");
});
