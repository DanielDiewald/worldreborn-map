import "server-only";

import { pool } from "@/lib/db";
import { deleteCalendarMonth, getProjectCalendar, moveCalendarMonth, saveProjectCalendar, updateCalendarMonth } from "@/lib/calendar";

async function dateUsage(projectId:number,calendarId:number){
  const result=await pool.query<{total:number}>(`SELECT (
      (SELECT count(*) FROM fantasy_dates WHERE project_id=$1 AND calendar_id=$2)
      + (SELECT count(*) FROM events WHERE camp_id=$1 AND calendar_id=$2)
    )::int AS total`,[projectId,calendarId]);
  return result.rows[0]?.total??0;
}

export async function saveProjectCalendarSafely(projectId:number,input:Record<string,unknown>){
  const current=await getProjectCalendar(projectId);
  if(current){
    const nextDays=Number(input.daysPerYear);
    const nextYearZero=Boolean(input.hasYearZero);
    const semanticChange=Number.isFinite(nextDays)&&nextDays!==current.daysPerYear||nextYearZero!==current.hasYearZero;
    if(semanticChange&&await dateUsage(projectId,current.calendarId)>0){
      throw new Error("Tage pro Jahr oder Jahr-0-Regel können nicht geändert werden, solange dieser Kalender bereits Datumswerte enthält. Migriere die vorhandenen Daten zuerst explizit.");
    }
  }
  return saveProjectCalendar(projectId,input);
}

export async function updateCalendarMonthSafely(projectId:number,monthId:number,input:{name:unknown;days:unknown}){
  const calendar=await getProjectCalendar(projectId);if(!calendar)throw new Error("Kalender fehlt.");
  const month=calendar.months.find((item)=>item.monthId===monthId);if(!month)throw new Error("Monat nicht gefunden.");
  const nextDays=Number(input.days);
  if(Number.isFinite(nextDays)&&nextDays!==month.days&&await dateUsage(projectId,calendar.calendarId)>0){
    throw new Error("Die Länge eines Monats kann nicht geändert werden, solange der Kalender bereits Datumswerte enthält. Die Monatsbezeichnung darf weiterhin geändert werden.");
  }
  return updateCalendarMonth(projectId,monthId,input);
}

export async function moveCalendarMonthSafely(projectId:number,monthId:number,direction:"up"|"down"){
  const calendar=await getProjectCalendar(projectId);if(!calendar)throw new Error("Kalender fehlt.");
  if(await dateUsage(projectId,calendar.calendarId)>0)throw new Error("Monate können nach Verwendung des Kalenders nicht still neu sortiert werden. Dafür ist eine explizite Datums-Migration erforderlich.");
  return moveCalendarMonth(projectId,monthId,direction);
}

export async function deleteCalendarMonthSafely(projectId:number,monthId:number){
  const calendar=await getProjectCalendar(projectId);if(!calendar)throw new Error("Kalender fehlt.");
  if(await dateUsage(projectId,calendar.calendarId)>0)throw new Error("Monate können nach Verwendung des Kalenders nicht gelöscht werden, weil sich dadurch bestehende Monatsnummern semantisch verschieben könnten.");
  return deleteCalendarMonth(projectId,monthId);
}
