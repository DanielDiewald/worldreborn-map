export type FantasyEra = "before" | "after";
export type FantasyDatePrecision = "exact_day" | "month" | "year" | "approximate_year" | "range" | "unknown";

export type CalendarMonth = {
  monthId?: number;
  sortOrder: number;
  name: string;
  days: number;
};

export type FantasyCalendar = {
  calendarId: number;
  projectId: number;
  name: string;
  daysPerYear: number;
  hasYearZero: boolean;
  beforeEraLabel: string;
  afterEraLabel: string;
  currentEra: FantasyEra;
  currentYear: number;
  currentMonth: number;
  currentDay: number;
  currentWorldDay: number | null;
  months: CalendarMonth[];
};

export type FantasyDate = {
  era: FantasyEra;
  year: number;
  month?: number | null;
  day?: number | null;
  precision: FantasyDatePrecision;
  rangeEnd?: {
    era: FantasyEra;
    year: number;
    month?: number | null;
    day?: number | null;
  } | null;
};

export type FantasyDateRange = { start: number; end: number };
export type FantasyAge = { min: number; max: number; label: string; source: "exact" | "year" | "approximate" | "range" };

function sortedMonths(calendar: FantasyCalendar) {
  return [...calendar.months].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function calendarDayTotal(calendar: FantasyCalendar) {
  return sortedMonths(calendar).reduce((sum, month) => sum + month.days, 0);
}

export function validateCalendar(calendar: FantasyCalendar) {
  const errors: string[] = [];
  const months = sortedMonths(calendar);
  if (!calendar.name.trim()) errors.push("Der Kalender braucht einen Namen.");
  if (!Number.isSafeInteger(calendar.daysPerYear) || calendar.daysPerYear <= 0) errors.push("Tage pro Jahr müssen größer als 0 sein.");
  if (!months.length) errors.push("Mindestens ein Monat ist erforderlich.");
  const orders = new Set<number>();
  for (const month of months) {
    if (!month.name.trim()) errors.push("Jeder Monat braucht einen Namen.");
    if (!Number.isSafeInteger(month.sortOrder) || month.sortOrder <= 0) errors.push(`Ungültige Reihenfolge für ${month.name || "Monat"}.`);
    if (!Number.isSafeInteger(month.days) || month.days <= 0) errors.push(`Ungültige Tageszahl für ${month.name || "Monat"}.`);
    if (orders.has(month.sortOrder)) errors.push(`Monatsreihenfolge ${month.sortOrder} ist doppelt.`);
    orders.add(month.sortOrder);
  }
  const sum = calendarDayTotal(calendar);
  if (months.length && sum !== calendar.daysPerYear) errors.push(`Monate ergeben ${sum} Tage, konfiguriert sind ${calendar.daysPerYear}.`);
  const current = validateFantasyDate({ era: calendar.currentEra, year: calendar.currentYear, month: calendar.currentMonth, day: calendar.currentDay, precision: "exact_day" }, calendar);
  errors.push(...current.map((error) => `Aktuelles Weltdatum: ${error}`));
  return [...new Set(errors)];
}

function yearIndex(era: FantasyEra, year: number, hasYearZero: boolean) {
  if (!Number.isSafeInteger(year) || year < 0) throw new Error("Fantasy-Jahr muss eine nicht-negative Ganzzahl sein.");
  if (!hasYearZero && year === 0) throw new Error("Dieser Kalender besitzt kein Jahr 0.");
  if (hasYearZero) return era === "before" ? -year : year;
  return era === "before" ? -year : year - 1;
}

function eraYearFromIndex(index: number, hasYearZero: boolean): { era: FantasyEra; year: number } {
  if (hasYearZero) return index < 0 ? { era: "before", year: Math.abs(index) } : { era: "after", year: index };
  return index < 0 ? { era: "before", year: Math.abs(index) } : { era: "after", year: index + 1 };
}

function floorDiv(value: number, divisor: number) {
  return Math.floor(value / divisor);
}

function monthAt(calendar: FantasyCalendar, monthNumber: number) {
  return sortedMonths(calendar)[monthNumber - 1];
}

function dayOffset(calendar: FantasyCalendar, monthNumber: number, day: number) {
  const months = sortedMonths(calendar);
  const month = months[monthNumber - 1];
  if (!month) throw new Error(`Monat ${monthNumber} existiert nicht.`);
  if (!Number.isSafeInteger(day) || day < 1 || day > month.days) throw new Error(`${month.name} hat nur ${month.days} Tage.`);
  return months.slice(0, monthNumber - 1).reduce((sum, item) => sum + item.days, 0) + day - 1;
}

export function validateFantasyDate(date: FantasyDate, calendar: FantasyCalendar) {
  const errors: string[] = [];
  try { yearIndex(date.era, date.year, calendar.hasYearZero); } catch (error) { errors.push(error instanceof Error ? error.message : "Ungültiges Jahr."); }
  const months = sortedMonths(calendar);
  const requireMonth = date.precision === "exact_day" || date.precision === "month";
  const requireDay = date.precision === "exact_day";
  if (requireMonth && (!date.month || !monthAt(calendar, date.month))) errors.push("Ein gültiger Monat ist erforderlich.");
  if (requireDay) {
    if (!date.month || !date.day) errors.push("Ein gültiger Tag ist erforderlich.");
    else {
      try { dayOffset(calendar, date.month, date.day); } catch (error) { errors.push(error instanceof Error ? error.message : "Ungültiger Tag."); }
    }
  }
  if (date.month && (date.month < 1 || date.month > months.length)) errors.push("Der Monat gehört nicht zu diesem Kalender.");
  if (date.precision === "range" && !date.rangeEnd) errors.push("Ein Zeitraum braucht ein Enddatum.");
  return [...new Set(errors)];
}

function boundOrdinal(date: { era: FantasyEra; year: number; month?: number | null; day?: number | null }, calendar: FantasyCalendar, end: boolean) {
  const months = sortedMonths(calendar);
  const y = yearIndex(date.era, date.year, calendar.hasYearZero);
  let offset = end ? calendar.daysPerYear - 1 : 0;
  if (date.month) {
    const month = months[date.month - 1];
    if (!month) throw new Error(`Monat ${date.month} existiert nicht.`);
    const before = months.slice(0, date.month - 1).reduce((sum, item) => sum + item.days, 0);
    offset = before + (date.day ? date.day - 1 : end ? month.days - 1 : 0);
  }
  return y * calendar.daysPerYear + offset;
}

export function fantasyDateToOrdinalRange(date: FantasyDate, calendar: FantasyCalendar): FantasyDateRange | null {
  if (date.precision === "unknown") return null;
  const errors = validateFantasyDate(date, calendar);
  if (errors.length) throw new Error(errors.join(" "));
  if (date.precision === "range" && date.rangeEnd) {
    const start = boundOrdinal(date, calendar, false);
    const end = boundOrdinal(date.rangeEnd, calendar, true);
    if (end < start) throw new Error("Das Enddatum liegt vor dem Startdatum.");
    return { start, end };
  }
  if (date.precision === "exact_day") {
    const exact = boundOrdinal(date, calendar, false);
    return { start: exact, end: exact };
  }
  if (date.precision === "month") return { start: boundOrdinal(date, calendar, false), end: boundOrdinal(date, calendar, true) };
  return {
    start: yearIndex(date.era, date.year, calendar.hasYearZero) * calendar.daysPerYear,
    end: yearIndex(date.era, date.year, calendar.hasYearZero) * calendar.daysPerYear + calendar.daysPerYear - 1,
  };
}

export function fantasyDateToOrdinal(date: FantasyDate, calendar: FantasyCalendar) {
  const range = fantasyDateToOrdinalRange(date, calendar);
  return range?.start ?? null;
}

export function ordinalToFantasyDate(ordinal: number, calendar: FantasyCalendar): FantasyDate {
  if (!Number.isSafeInteger(ordinal)) throw new Error("World Day muss eine Ganzzahl sein.");
  const yIndex = floorDiv(ordinal, calendar.daysPerYear);
  let remaining = ordinal - yIndex * calendar.daysPerYear;
  const months = sortedMonths(calendar);
  let month = 1;
  for (let index = 0; index < months.length; index += 1) {
    if (remaining < months[index].days) { month = index + 1; break; }
    remaining -= months[index].days;
  }
  const eraYear = eraYearFromIndex(yIndex, calendar.hasYearZero);
  return { ...eraYear, month, day: remaining + 1, precision: "exact_day" };
}

function formattedYear(era: FantasyEra, year: number, calendar: FantasyCalendar) {
  if (calendar.hasYearZero && year === 0) return "0";
  return `${year} ${era === "before" ? calendar.beforeEraLabel : calendar.afterEraLabel}`.trim();
}

export function formatFantasyDate(date: FantasyDate | null | undefined, calendar: FantasyCalendar) {
  if (!date || date.precision === "unknown") return "Unbekannt";
  const month = date.month ? monthAt(calendar, date.month)?.name : null;
  const year = formattedYear(date.era, date.year, calendar);
  let value = year;
  if (date.precision === "month" && month) value = `${month} ${year}`;
  if (date.precision === "exact_day" && month && date.day) value = `${date.day}. ${month} ${year}`;
  if (date.precision === "approximate_year") value = `ca. ${year}`;
  if (date.precision === "range" && date.rangeEnd) {
    const start: FantasyDate = { ...date, precision: date.day ? "exact_day" : date.month ? "month" : "year", rangeEnd: null };
    const end: FantasyDate = { ...date.rangeEnd, precision: date.rangeEnd.day ? "exact_day" : date.rangeEnd.month ? "month" : "year" };
    value = `${formatFantasyDate(start, calendar)} – ${formatFantasyDate(end, calendar)}`;
  }
  return value;
}

export function currentFantasyDate(calendar: FantasyCalendar): FantasyDate {
  return { era: calendar.currentEra, year: calendar.currentYear, month: calendar.currentMonth, day: calendar.currentDay, precision: "exact_day" };
}

export function calculateFantasyAge(birth: FantasyDate | null | undefined, calendar: FantasyCalendar, at: FantasyDate = currentFantasyDate(calendar)): FantasyAge | null {
  if (!birth || birth.precision === "unknown") return null;
  const birthRange = fantasyDateToOrdinalRange(birth, calendar);
  const atRange = fantasyDateToOrdinalRange(at, calendar);
  if (!birthRange || !atRange) return null;
  const current = atRange.start;
  if (birthRange.start > current) return null;
  const min = Math.max(0, Math.floor((current - birthRange.end) / calendar.daysPerYear));
  const max = Math.max(min, Math.floor((current - birthRange.start) / calendar.daysPerYear));
  if (birth.precision === "exact_day") return { min, max: min, label: `${min} Jahre`, source: "exact" };
  if (birth.precision === "approximate_year") return { min, max, label: `ca. ${Math.round((min + max) / 2)} Jahre`, source: "approximate" };
  if (birth.precision === "range") return { min, max, label: min === max ? `${min} Jahre` : `${min}–${max} Jahre`, source: "range" };
  return { min, max, label: min === max ? `${min} Jahre` : `ca. ${min}–${max} Jahre`, source: "year" };
}

export function compareFantasyDates(a: FantasyDate, b: FantasyDate, calendar: FantasyCalendar) {
  const ar = fantasyDateToOrdinalRange(a, calendar);
  const br = fantasyDateToOrdinalRange(b, calendar);
  if (!ar && !br) return 0;
  if (!ar) return 1;
  if (!br) return -1;
  return ar.start - br.start || ar.end - br.end;
}

export function parseFantasyDateFields(values: Record<string, unknown>, prefix: string): FantasyDate | null {
  const precision = String(values[`${prefix}Precision`] ?? "unknown") as FantasyDatePrecision;
  if (precision === "unknown" || !values[`${prefix}Year`]) return null;
  const era = String(values[`${prefix}Era`] ?? "after") === "before" ? "before" : "after";
  const year = Number(values[`${prefix}Year`]);
  const monthRaw = values[`${prefix}Month`];
  const dayRaw = values[`${prefix}Day`];
  const month = monthRaw === "" || monthRaw == null ? null : Number(monthRaw);
  const day = dayRaw === "" || dayRaw == null ? null : Number(dayRaw);
  return { era, year, month, day, precision };
}
