import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";
import {
  calculateFantasyAge,
  calendarDayTotal,
  currentFantasyDate,
  fantasyDateToOrdinalRange,
  formatFantasyDate,
  ordinalToFantasyDate,
  validateCalendar,
  validateFantasyDate,
  type CalendarMonth,
  type FantasyCalendar,
  type FantasyDate,
} from "@/lib/fantasy-calendar";

const calendarSettingsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  daysPerYear: z.coerce.number().int().positive().max(1_000_000),
  hasYearZero: z.coerce.boolean().default(false),
  beforeEraLabel: z.string().trim().min(1).max(40),
  afterEraLabel: z.string().trim().min(1).max(40),
  currentEra: z.enum(["before", "after"]),
  currentYear: z.coerce.number().int().min(0).max(10_000_000),
  currentMonth: z.coerce.number().int().positive(),
  currentDay: z.coerce.number().int().positive(),
});

const monthSchema = z.object({ name: z.string().trim().min(1).max(120), days: z.coerce.number().int().positive().max(1_000_000) });

type CalendarRow = {
  calendar_id: string;
  project_id: number;
  name: string;
  days_per_year: number;
  has_year_zero: boolean;
  before_era_label: string;
  after_era_label: string;
  current_era: "before" | "after";
  current_year: number;
  current_month: number;
  current_day: number;
  current_world_day: string | null;
};

type DateRow = {
  era: "before" | "after";
  year: number;
  month: number | null;
  day: number | null;
  precision: FantasyDate["precision"];
  range_end_era: "before" | "after" | null;
  range_end_year: number | null;
  range_end_month: number | null;
  range_end_day: number | null;
  source: string;
};

function mapDate(row: DateRow | undefined): FantasyDate | null {
  if (!row) return null;
  return {
    era: row.era,
    year: row.year,
    month: row.month,
    day: row.day,
    precision: row.precision,
    rangeEnd: row.range_end_era && row.range_end_year != null ? {
      era: row.range_end_era,
      year: row.range_end_year,
      month: row.range_end_month,
      day: row.range_end_day,
    } : null,
  };
}

async function calendarFromRow(row: CalendarRow): Promise<FantasyCalendar> {
  const months = await pool.query<{ month_id: string; sort_order: number; name: string; days: number }>(
    "SELECT month_id,sort_order,name,days FROM calendar_months WHERE calendar_id=$1 ORDER BY sort_order,month_id",
    [row.calendar_id],
  );
  return {
    calendarId: Number(row.calendar_id),
    projectId: row.project_id,
    name: row.name,
    daysPerYear: row.days_per_year,
    hasYearZero: row.has_year_zero,
    beforeEraLabel: row.before_era_label,
    afterEraLabel: row.after_era_label,
    currentEra: row.current_era,
    currentYear: row.current_year,
    currentMonth: row.current_month,
    currentDay: row.current_day,
    currentWorldDay: row.current_world_day == null ? null : Number(row.current_world_day),
    months: months.rows.map<CalendarMonth>((month) => ({ monthId: Number(month.month_id), sortOrder: month.sort_order, name: month.name, days: month.days })),
  };
}

export async function getProjectCalendar(projectId: number) {
  const result = await pool.query<CalendarRow>(
    `SELECT calendar_id,project_id,name,days_per_year,has_year_zero,before_era_label,after_era_label,current_era,current_year,current_month,current_day,current_world_day
       FROM project_calendars WHERE project_id=$1 AND is_active=true ORDER BY calendar_id LIMIT 1`,
    [projectId],
  );
  return result.rows[0] ? calendarFromRow(result.rows[0]) : null;
}

export function calendarStatus(calendar: FantasyCalendar | null) {
  if (!calendar) return { ready: false, errors: ["Noch kein Weltkalender konfiguriert."], monthDays: 0 };
  const errors = validateCalendar(calendar);
  return { ready: errors.length === 0, errors, monthDays: calendarDayTotal(calendar) };
}

export async function saveProjectCalendar(projectId: number, input: unknown) {
  const data = calendarSettingsSchema.parse(input);
  const project = await pool.query("SELECT 1 FROM campaigns WHERE camp_id=$1 AND status<>'archived'", [projectId]);
  if (project.rowCount !== 1) throw new Error("Projekt nicht gefunden oder archiviert.");
  const existing = await getProjectCalendar(projectId);
  if (!existing) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const created = await client.query<{ calendar_id: string }>(
        `INSERT INTO project_calendars(project_id,name,days_per_year,has_year_zero,before_era_label,after_era_label,current_era,current_year,current_month,current_day,is_active)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,1,1,true) RETURNING calendar_id`,
        [projectId, data.name, data.daysPerYear, data.hasYearZero, data.beforeEraLabel, data.afterEraLabel, data.currentEra, data.currentYear],
      );
      const calendarId = Number(created.rows[0].calendar_id);
      await client.query("INSERT INTO calendar_months(calendar_id,sort_order,name,days) VALUES($1,1,'Jahreslauf',$2)", [calendarId, data.daysPerYear]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  const calendar = await getProjectCalendar(projectId);
  if (!calendar) throw new Error("Kalender konnte nicht angelegt werden.");
  const candidate: FantasyCalendar = { ...calendar, name: data.name, daysPerYear: data.daysPerYear, hasYearZero: data.hasYearZero, beforeEraLabel: data.beforeEraLabel, afterEraLabel: data.afterEraLabel, currentEra: data.currentEra, currentYear: data.currentYear, currentMonth: data.currentMonth, currentDay: data.currentDay };
  const dateErrors = validateFantasyDate(currentFantasyDate(candidate), candidate);
  if (dateErrors.length) throw new Error(dateErrors.join(" "));
  const currentRange = fantasyDateToOrdinalRange(currentFantasyDate(candidate), candidate);
  await pool.query(
    `UPDATE project_calendars SET name=$3,days_per_year=$4,has_year_zero=$5,before_era_label=$6,after_era_label=$7,current_era=$8,current_year=$9,current_month=$10,current_day=$11,current_world_day=$12,updated_at=now()
      WHERE project_id=$1 AND calendar_id=$2`,
    [projectId, candidate.calendarId, data.name, data.daysPerYear, data.hasYearZero, data.beforeEraLabel, data.afterEraLabel, data.currentEra, data.currentYear, data.currentMonth, data.currentDay, currentRange?.start ?? null],
  );
  await pool.query("UPDATE campaigns SET in_world_date=$2,updated_at=now() WHERE camp_id=$1", [projectId, formatFantasyDate(currentFantasyDate(candidate), candidate)]);
  return getProjectCalendar(projectId);
}

export async function addCalendarMonth(projectId: number, input: unknown) {
  const data = monthSchema.parse(input);
  const calendar = await getProjectCalendar(projectId); if (!calendar) throw new Error("Lege zuerst einen Kalender an.");
  const next = Math.max(0, ...calendar.months.map((month) => month.sortOrder)) + 1;
  await pool.query("INSERT INTO calendar_months(calendar_id,sort_order,name,days) VALUES($1,$2,$3,$4)", [calendar.calendarId, next, data.name, data.days]);
}

export async function updateCalendarMonth(projectId: number, monthId: number, input: unknown) {
  const data = monthSchema.parse(input);
  const calendar = await getProjectCalendar(projectId); if (!calendar) throw new Error("Kalender fehlt.");
  const result = await pool.query("UPDATE calendar_months SET name=$3,days=$4,updated_at=now() WHERE calendar_id=$1 AND month_id=$2", [calendar.calendarId, monthId, data.name, data.days]);
  if (result.rowCount !== 1) throw new Error("Monat gehört nicht zu diesem Kalender.");
}

export async function deleteCalendarMonth(projectId: number, monthId: number) {
  const calendar = await getProjectCalendar(projectId); if (!calendar) throw new Error("Kalender fehlt.");
  if (calendar.months.length <= 1) throw new Error("Ein Kalender braucht mindestens einen Monat.");
  const used = await pool.query(
    `SELECT EXISTS(SELECT 1 FROM fantasy_dates WHERE calendar_id=$1 AND (month=(SELECT sort_order FROM calendar_months WHERE month_id=$2) OR range_end_month=(SELECT sort_order FROM calendar_months WHERE month_id=$2)))
         OR EXISTS(SELECT 1 FROM events WHERE calendar_id=$1 AND fantasy_month=(SELECT sort_order FROM calendar_months WHERE month_id=$2)) AS used`,
    [calendar.calendarId, monthId],
  );
  if (used.rows[0]?.used) throw new Error("Dieser Monat wird bereits von Datumswerten verwendet und kann nicht gelöscht werden.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ sort_order: number }>("DELETE FROM calendar_months WHERE calendar_id=$1 AND month_id=$2 RETURNING sort_order", [calendar.calendarId, monthId]);
    if (current.rowCount !== 1) throw new Error("Monat nicht gefunden.");
    await client.query("UPDATE calendar_months SET sort_order=sort_order-1,updated_at=now() WHERE calendar_id=$1 AND sort_order>$2", [calendar.calendarId, current.rows[0].sort_order]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function moveCalendarMonth(projectId: number, monthId: number, direction: "up" | "down") {
  const calendar = await getProjectCalendar(projectId); if (!calendar) throw new Error("Kalender fehlt.");
  const month = calendar.months.find((item) => item.monthId === monthId); if (!month) throw new Error("Monat nicht gefunden.");
  const targetOrder = month.sortOrder + (direction === "up" ? -1 : 1);
  const target = calendar.months.find((item) => item.sortOrder === targetOrder); if (!target?.monthId) return;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("UPDATE calendar_months SET sort_order=-1 WHERE calendar_id=$1 AND month_id=$2", [calendar.calendarId, monthId]);
    await client.query("UPDATE calendar_months SET sort_order=$3 WHERE calendar_id=$1 AND month_id=$2", [calendar.calendarId, target.monthId, month.sortOrder]);
    await client.query("UPDATE calendar_months SET sort_order=$3 WHERE calendar_id=$1 AND month_id=$2", [calendar.calendarId, monthId, targetOrder]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function getEntityFantasyDate(projectId: number, entityType: string, entityId: number, fieldKey: string) {
  const result = await pool.query<DateRow>(
    `SELECT era,year,month,day,precision,range_end_era,range_end_year,range_end_month,range_end_day,source
       FROM fantasy_dates WHERE project_id=$1 AND entity_type=$2 AND entity_id=$3 AND field_key=$4`,
    [projectId, entityType, entityId, fieldKey],
  );
  return mapDate(result.rows[0]);
}

export async function savePersonFantasyDate(projectId: number, personId: number, fieldKey: "birth" | "death", date: FantasyDate | null, source = "manual") {
  const person = await pool.query("SELECT 1 FROM npcs WHERE camp_id=$1 AND n_id=$2 AND archived_at IS NULL", [projectId, personId]);
  if (person.rowCount !== 1) throw new Error("Person gehört nicht zu diesem Projekt.");
  const calendar = await getProjectCalendar(projectId); if (!calendar) throw new Error("Konfiguriere zuerst den Weltkalender.");
  const status = calendarStatus(calendar); if (!status.ready) throw new Error(`Kalender ist noch nicht gültig: ${status.errors.join(" ")}`);
  if (!date) {
    await pool.query("DELETE FROM fantasy_dates WHERE project_id=$1 AND entity_type='person' AND entity_id=$2 AND field_key=$3", [projectId, personId, fieldKey]);
    return;
  }
  const errors = validateFantasyDate(date, calendar); if (errors.length) throw new Error(errors.join(" "));
  const ordinal = fantasyDateToOrdinalRange(date, calendar);
  await pool.query(
    `INSERT INTO fantasy_dates(project_id,calendar_id,entity_type,entity_id,field_key,era,year,month,day,precision,range_end_era,range_end_year,range_end_month,range_end_day,ordinal_start,ordinal_end,source)
     VALUES($1,$2,'person',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT(project_id,entity_type,entity_id,field_key) DO UPDATE SET calendar_id=EXCLUDED.calendar_id,era=EXCLUDED.era,year=EXCLUDED.year,month=EXCLUDED.month,day=EXCLUDED.day,precision=EXCLUDED.precision,range_end_era=EXCLUDED.range_end_era,range_end_year=EXCLUDED.range_end_year,range_end_month=EXCLUDED.range_end_month,range_end_day=EXCLUDED.range_end_day,ordinal_start=EXCLUDED.ordinal_start,ordinal_end=EXCLUDED.ordinal_end,source=EXCLUDED.source,updated_at=now()`,
    [projectId, calendar.calendarId, personId, fieldKey, date.era, date.year, date.month ?? null, date.day ?? null, date.precision, date.rangeEnd?.era ?? null, date.rangeEnd?.year ?? null, date.rangeEnd?.month ?? null, date.rangeEnd?.day ?? null, ordinal?.start ?? null, ordinal?.end ?? null, source],
  );
}

export async function personChronology(projectId: number, personId: number) {
  const [calendar, birth, death] = await Promise.all([getProjectCalendar(projectId), getEntityFantasyDate(projectId, "person", personId, "birth"), getEntityFantasyDate(projectId, "person", personId, "death")]);
  if (!calendar) return { calendar: null, birth, death, birthLabel: null, deathLabel: null, ageLabel: null, lifeLabel: null };
  const birthLabel = birth ? formatFantasyDate(birth, calendar) : null;
  const deathLabel = death ? formatFantasyDate(death, calendar) : null;
  const age = birth ? calculateFantasyAge(birth, calendar, death ?? currentFantasyDate(calendar)) : null;
  const lifeLabel = birthLabel && deathLabel ? `${birthLabel} – ${deathLabel}` : birthLabel ? `geb. ${birthLabel}` : deathLabel ? `gest. ${deathLabel}` : null;
  return { calendar, birth, death, birthLabel, deathLabel, ageLabel: age?.label ?? null, lifeLabel };
}

export async function legacyCalendarAudit(projectId: number) {
  const result = await pool.query<{ total: number; with_age: number; with_birthday: number; with_both: number; conflicts: number; pending: number; migrated: number }>(
    `SELECT count(*)::int total,
            count(*) FILTER (WHERE old_age IS NOT NULL AND old_age>0)::int with_age,
            count(*) FILTER (WHERE old_birthday IS NOT NULL AND old_birthday<>'2000-01-01')::int with_birthday,
            count(*) FILTER (WHERE old_age IS NOT NULL AND old_age>0 AND old_birthday IS NOT NULL AND old_birthday<>'2000-01-01')::int with_both,
            count(*) FILTER (WHERE COALESCE((detail->>'species_race_conflict')::boolean,false))::int conflicts,
            count(*) FILTER (WHERE status='pending')::int pending,
            count(*) FILTER (WHERE status='migrated')::int migrated
       FROM calendar_migration_audit WHERE project_id=$1`, [projectId]);
  return result.rows[0] ?? { total: 0, with_age: 0, with_birthday: 0, with_both: 0, conflicts: 0, pending: 0, migrated: 0 };
}

export async function migrateLegacyCharacterAges(projectId: number) {
  const calendar = await getProjectCalendar(projectId); if (!calendar) throw new Error("Konfiguriere zuerst den Weltkalender.");
  const status = calendarStatus(calendar); if (!status.ready) throw new Error(`Kalender ist noch nicht gültig: ${status.errors.join(" ")}`);
  const currentRange = fantasyDateToOrdinalRange(currentFantasyDate(calendar), calendar); if (!currentRange) throw new Error("Aktuelles Weltdatum ist ungültig.");
  const rows = await pool.query<{ person_id: number; old_age: number | null; old_birthday: string | null; old_species: string | null; old_race: string | null }>(
    `SELECT a.person_id,a.old_age,a.old_birthday,a.old_species,a.old_race FROM calendar_migration_audit a
      WHERE a.project_id=$1 AND a.status='pending' ORDER BY a.person_id`, [projectId]);
  const client = await pool.connect(); let migrated = 0; let review = 0;
  try {
    await client.query("BEGIN");
    for (const row of rows.rows) {
      const exists = await client.query("SELECT 1 FROM fantasy_dates WHERE project_id=$1 AND entity_type='person' AND entity_id=$2 AND field_key='birth'", [projectId, row.person_id]);
      if (exists.rowCount) {
        await client.query("UPDATE calendar_migration_audit SET status='skipped',migration_method='existing_fantasy_date',updated_at=now() WHERE project_id=$1 AND person_id=$2", [projectId, row.person_id]);
        continue;
      }
      if (row.old_birthday && row.old_birthday !== "2000-01-01") {
        await client.query("UPDATE calendar_migration_audit SET status='needs_review',migration_method='conflicting_data',detail=detail||$3::jsonb,updated_at=now() WHERE project_id=$1 AND person_id=$2", [projectId, row.person_id, JSON.stringify({ reason: "legacy_birthday_requires_calendar_mapping" })]);
        review += 1;
        continue;
      }
      if (!row.old_age || row.old_age <= 0) {
        await client.query("UPDATE calendar_migration_audit SET status='needs_review',migration_method='unresolved',updated_at=now() WHERE project_id=$1 AND person_id=$2", [projectId, row.person_id]);
        review += 1;
        continue;
      }
      const estimate = ordinalToFantasyDate(currentRange.start - row.old_age * calendar.daysPerYear, calendar);
      const date: FantasyDate = { era: estimate.era, year: estimate.year, precision: "approximate_year" };
      const ordinal = fantasyDateToOrdinalRange(date, calendar)!;
      const inserted = await client.query<{ fantasy_date_id: string }>(
        `INSERT INTO fantasy_dates(project_id,calendar_id,entity_type,entity_id,field_key,era,year,precision,ordinal_start,ordinal_end,source,metadata)
         VALUES($1,$2,'person',$3,'birth',$4,$5,'approximate_year',$6,$7,'estimated_from_age',$8::jsonb) RETURNING fantasy_date_id`,
        [projectId, calendar.calendarId, row.person_id, date.era, date.year, ordinal.start, ordinal.end, JSON.stringify({ legacy_age: row.old_age })],
      );
      if ((!row.old_race || ["unknown", "unbekannt"].includes(row.old_race.trim().toLowerCase())) && row.old_species?.trim()) {
        await client.query("UPDATE charakters SET race=$2 WHERE n_id=$1", [row.person_id, row.old_species.trim()]);
      }
      await client.query("UPDATE calendar_migration_audit SET status='migrated',migration_method='estimated_from_age',new_fantasy_date_id=$3,detail=detail||$4::jsonb,updated_at=now() WHERE project_id=$1 AND person_id=$2", [projectId, row.person_id, Number(inserted.rows[0].fantasy_date_id), JSON.stringify({ estimated_era: date.era, estimated_year: date.year, race_backfilled: Boolean((!row.old_race || ["unknown", "unbekannt"].includes(row.old_race.trim().toLowerCase())) && row.old_species?.trim()) })]);
      migrated += 1;
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  return { migrated, needsReview: review };
}
