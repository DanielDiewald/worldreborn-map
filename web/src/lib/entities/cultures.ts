import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";

const cultureSchema = z.object({
  name: z.string().trim().min(1,"Name ist ein Pflichtfeld.").max(160,"Der Name darf höchstens 160 Zeichen enthalten."),
  description: z.string().trim().max(100_000).optional().nullable(),
  image: z.string().trim().max(4000).default("noimage"),
  imageMediaId: z.coerce.number().int().positive().nullable().optional(),
  primaryLocationId: z.coerce.number().int().positive().nullable().optional(),
  visibilityMode: z.enum(["admin_only", "all_players", "selected_players"]).default("admin_only"),
});

export type CultureInput = z.input<typeof cultureSchema>;
export type CultureRow = {
  cultureId: number; projectId: number; name: string; description: string | null; image: string; imageMediaId: number | null;
  primaryLocationId: number | null; primaryLocationName: string | null; visibilityMode: string; raceCount: number;
};
export type CultureRaceRow = { raceId: number; name: string; parentName: string | null; isPrimary: boolean; notes: string | null };

const cultureSelect = `SELECT c.culture_id::int AS "cultureId",c.project_id AS "projectId",c.name,c.description,c.image,c.image_media_id::int AS "imageMediaId",c.primary_location_id::int AS "primaryLocationId",l.name AS "primaryLocationName",c.visibility_mode AS "visibilityMode",(SELECT count(*)::int FROM culture_races cr WHERE cr.culture_id=c.culture_id) AS "raceCount" FROM cultures c LEFT JOIN locations l ON l.camp_id=c.project_id AND l.loc_id=c.primary_location_id`;
const cultureListSelect = `SELECT c.culture_id::int AS "cultureId",c.project_id AS "projectId",c.name,LEFT(c.description,240) AS description,
  CASE WHEN c.image ~ '^/api/media/[0-9]+$' OR c.image ~* '^https?://' OR c.image LIKE '//%' OR c.image LIKE '/img/%' OR c.image LIKE '/images/%' OR c.image LIKE '/uploads/%'
    THEN '/api/admin/projects/'||c.project_id||'/entity-images/culture/'||c.culture_id||'/avatar' ELSE c.image END AS image,
  c.image_media_id::int AS "imageMediaId",c.primary_location_id::int AS "primaryLocationId",l.name AS "primaryLocationName",c.visibility_mode AS "visibilityMode",COALESCE(rc.race_count,0)::int AS "raceCount"
  FROM cultures c
  LEFT JOIN locations l ON l.camp_id=c.project_id AND l.loc_id=c.primary_location_id
  LEFT JOIN (SELECT project_id,culture_id,count(*)::int AS race_count FROM culture_races GROUP BY project_id,culture_id) rc ON rc.project_id=c.project_id AND rc.culture_id=c.culture_id`;

function clean(value: string | null | undefined) { return value?.trim() || null; }
async function assertMedia(projectId: number, mediaId: number | null | undefined) { if (!mediaId) return; const row = await pool.query("SELECT 1 FROM media WHERE project_id=$1 AND media_id=$2", [projectId, mediaId]); if (row.rowCount !== 1) throw new Error("Das Vorschaubild gehört nicht zu dieser Welt."); }
async function assertLocation(projectId: number, locationId: number | null | undefined) { if (!locationId) return; const row = await pool.query("SELECT 1 FROM locations WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL", [projectId, locationId]); if (row.rowCount !== 1) throw new Error("Das kulturelle Kerngebiet gehört nicht zu dieser Welt oder ist archiviert."); }

export async function listCultures(projectId: number) { const result = await pool.query<CultureRow>(`${cultureListSelect} WHERE c.project_id=$1 AND c.archived_at IS NULL ORDER BY c.name,c.culture_id`, [projectId]); return result.rows; }
export async function getCulture(projectId: number, cultureId: number) { const result = await pool.query<CultureRow>(`${cultureSelect} WHERE c.project_id=$1 AND c.culture_id=$2 AND c.archived_at IS NULL`, [projectId, cultureId]); return result.rows[0] ?? null; }
export async function listCultureRaces(projectId: number, cultureId: number) { const result = await pool.query<CultureRaceRow>(`SELECT r.race_id::int AS "raceId",r.name,p.name AS "parentName",cr.is_primary AS "isPrimary",cr.notes FROM culture_races cr JOIN races r ON r.project_id=cr.project_id AND r.race_id=cr.race_id AND r.archived_at IS NULL LEFT JOIN races p ON p.project_id=r.project_id AND p.race_id=r.parent_race_id AND p.archived_at IS NULL WHERE cr.project_id=$1 AND cr.culture_id=$2 ORDER BY cr.is_primary DESC,COALESCE(p.name,r.name),r.name`, [projectId, cultureId]); return result.rows; }

export async function createCulture(projectId: number, input: CultureInput) {
  const data = cultureSchema.parse(input); await Promise.all([assertMedia(projectId, data.imageMediaId), assertLocation(projectId, data.primaryLocationId)]);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const result = await client.query<{ culture_id: number }>(`INSERT INTO cultures(project_id,name,description,image,image_media_id,primary_location_id,visibility_mode,metadata) SELECT c.camp_id,$2,$3,$4,$5,$6,$7,'{}'::jsonb FROM campaigns c WHERE c.camp_id=$1 AND c.status<>'archived' RETURNING culture_id`, [projectId, data.name, clean(data.description), data.image || "noimage", data.imageMediaId ?? null, data.primaryLocationId ?? null, data.visibilityMode]);
    if (result.rowCount !== 1) throw new Error("Die Welt wurde nicht gefunden oder ist archiviert.");
    const cultureId = Number(result.rows[0].culture_id);
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','culture.created','culture',$2,$3::jsonb)`, [projectId, cultureId, JSON.stringify({ name: data.name })]);
    await client.query("COMMIT");
    return { cultureId };
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function updateCulture(projectId: number, cultureId: number, input: CultureInput) {
  const data = cultureSchema.parse(input); await Promise.all([assertMedia(projectId, data.imageMediaId), assertLocation(projectId, data.primaryLocationId)]);
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const result=await client.query("UPDATE cultures SET name=$3,description=$4,image=$5,image_media_id=$6,primary_location_id=$7,visibility_mode=$8,updated_at=now() WHERE project_id=$1 AND culture_id=$2 AND archived_at IS NULL", [projectId, cultureId, data.name, clean(data.description), data.image || "noimage", data.imageMediaId ?? null, data.primaryLocationId ?? null, data.visibilityMode]);
    if(result.rowCount!==1)throw new Error("Die Kultur wurde nicht gefunden oder ist archiviert.");
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','culture.updated','culture',$2,$3::jsonb)`,[projectId,cultureId,JSON.stringify({name:data.name})]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function linkCultureRace(projectId: number, cultureId: number, raceId: number, isPrimary = false, notes?: string | null) {
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const valid=await client.query(`SELECT 1 FROM cultures c JOIN races r ON r.project_id=c.project_id WHERE c.project_id=$1 AND c.culture_id=$2 AND c.archived_at IS NULL AND r.race_id=$3 AND r.archived_at IS NULL`,[projectId,cultureId,raceId]);
    if(valid.rowCount!==1)throw new Error("Kultur und Spezies müssen aktiv sein und zur selben Welt gehören.");
    await client.query(`INSERT INTO culture_races(project_id,culture_id,race_id,is_primary,notes) VALUES($1,$2,$3,$4,$5) ON CONFLICT(culture_id,race_id) DO UPDATE SET is_primary=EXCLUDED.is_primary,notes=EXCLUDED.notes`, [projectId, cultureId, raceId, isPrimary, clean(notes)]);
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','culture.race_linked','culture',$2,$3::jsonb)`,[projectId,cultureId,JSON.stringify({race_id:raceId,is_primary:isPrimary})]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export async function unlinkCultureRace(projectId: number, cultureId: number, raceId: number) {
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const deleted=await client.query("DELETE FROM culture_races WHERE project_id=$1 AND culture_id=$2 AND race_id=$3", [projectId, cultureId, raceId]);
    if(deleted.rowCount!==1)throw new Error("Diese Spezies ist nicht mit der Kultur verknüpft.");
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','culture.race_unlinked','culture',$2,$3::jsonb)`,[projectId,cultureId,JSON.stringify({race_id:raceId})]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
export async function archiveCulture(projectId: number, cultureId: number) {
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const result=await client.query("UPDATE cultures SET archived_at=now(),updated_at=now() WHERE project_id=$1 AND culture_id=$2 AND archived_at IS NULL", [projectId, cultureId]);
    if(result.rowCount!==1)throw new Error("Die Kultur wurde nicht gefunden oder ist bereits archiviert.");
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id) VALUES($1,'admin','culture.archived','culture',$2)`, [projectId, cultureId]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}
