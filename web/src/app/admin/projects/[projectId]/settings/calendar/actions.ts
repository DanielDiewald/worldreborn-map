"use server";

import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/auth/session";
import { addCalendarMonth, migrateLegacyCharacterAges } from "@/lib/calendar";
import { deleteCalendarMonthSafely, moveCalendarMonthSafely, saveProjectCalendarSafely, updateCalendarMonthSafely } from "@/lib/calendar-structure";
import { formCheckbox, formText } from "@/lib/form-data";
import { getProject } from "@/lib/projects";

function calendarValues(formData:FormData){return{name:formText(formData,"name"),daysPerYear:formText(formData,"daysPerYear"),hasYearZero:formCheckbox(formData,"hasYearZero"),beforeEraLabel:formText(formData,"beforeEraLabel"),afterEraLabel:formText(formData,"afterEraLabel"),currentEra:formText(formData,"currentEra"),currentYear:formText(formData,"currentYear"),currentMonth:formText(formData,"currentMonth"),currentDay:formText(formData,"currentDay")};}
async function assertProject(projectId:number){if(!Number.isSafeInteger(projectId)||projectId<=0||!(await getProject(projectId)))throw new Error("Die ausgewählte Welt wurde nicht gefunden oder ist archiviert.");}
function assertMonthId(monthId:number){if(!Number.isSafeInteger(monthId)||monthId<=0)throw new Error("Ungültige Monats-ID.");}
function refresh(projectId:number){revalidatePath(`/admin/projects/${projectId}/settings/calendar`);revalidatePath(`/admin/projects/${projectId}/npcs`);revalidatePath(`/admin/projects/${projectId}/timeline`);revalidatePath(`/admin/projects/${projectId}/family-trees`);revalidatePath(`/admin/projects/${projectId}/characters`);}
export async function saveCalendarAction(projectId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);await saveProjectCalendarSafely(projectId,calendarValues(formData));refresh(projectId);}
export async function addMonthAction(projectId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);await addCalendarMonth(projectId,{name:formText(formData,"name"),days:formText(formData,"days")});refresh(projectId);}
export async function updateMonthAction(projectId:number,monthId:number,formData:FormData){await requireAdminSession();await assertProject(projectId);assertMonthId(monthId);await updateCalendarMonthSafely(projectId,monthId,{name:formText(formData,"name"),days:formText(formData,"days")});refresh(projectId);}
export async function deleteMonthAction(projectId:number,monthId:number){await requireAdminSession();await assertProject(projectId);assertMonthId(monthId);await deleteCalendarMonthSafely(projectId,monthId);refresh(projectId);}
export async function moveMonthAction(projectId:number,monthId:number,direction:"up"|"down"){await requireAdminSession();await assertProject(projectId);assertMonthId(monthId);await moveCalendarMonthSafely(projectId,monthId,direction);refresh(projectId);}
export async function migrateLegacyAgesAction(projectId:number){await requireAdminSession();await assertProject(projectId);await migrateLegacyCharacterAges(projectId);refresh(projectId);}
