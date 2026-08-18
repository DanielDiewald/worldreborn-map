"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { addCalendarMonth, deleteCalendarMonth, migrateLegacyCharacterAges, moveCalendarMonth, saveProjectCalendar, updateCalendarMonth } from "@/lib/calendar";

function calendarValues(formData:FormData){return{name:formData.get("name"),daysPerYear:formData.get("daysPerYear"),hasYearZero:formData.get("hasYearZero")==="on",beforeEraLabel:formData.get("beforeEraLabel"),afterEraLabel:formData.get("afterEraLabel"),currentEra:formData.get("currentEra"),currentYear:formData.get("currentYear"),currentMonth:formData.get("currentMonth"),currentDay:formData.get("currentDay")};}
function refresh(projectId:number){revalidatePath(`/admin/projects/${projectId}/settings/calendar`);revalidatePath(`/admin/projects/${projectId}/npcs`);revalidatePath(`/admin/projects/${projectId}/timeline`);revalidatePath(`/admin/projects/${projectId}/family-trees`);}
export async function saveCalendarAction(projectId:number,formData:FormData){await requireAdminSession();await saveProjectCalendar(projectId,calendarValues(formData));refresh(projectId);}
export async function addMonthAction(projectId:number,formData:FormData){await requireAdminSession();await addCalendarMonth(projectId,{name:formData.get("name"),days:formData.get("days")});refresh(projectId);}
export async function updateMonthAction(projectId:number,monthId:number,formData:FormData){await requireAdminSession();await updateCalendarMonth(projectId,monthId,{name:formData.get("name"),days:formData.get("days")});refresh(projectId);}
export async function deleteMonthAction(projectId:number,monthId:number){await requireAdminSession();await deleteCalendarMonth(projectId,monthId);refresh(projectId);}
export async function moveMonthAction(projectId:number,monthId:number,direction:"up"|"down"){await requireAdminSession();await moveCalendarMonth(projectId,monthId,direction);refresh(projectId);}
export async function migrateLegacyAgesAction(projectId:number){await requireAdminSession();await migrateLegacyCharacterAges(projectId);refresh(projectId);}
