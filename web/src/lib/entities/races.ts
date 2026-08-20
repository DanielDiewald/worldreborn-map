import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";
import type { PersonGender } from "@/lib/person-gender";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const raceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentRaceId: z.coerce.number().int().positive().nullable().optional(),
  masculineName: optionalText(120),
  feminineName: optionalText(120),
  hermaphroditeName: optionalText(120),
  description: optionalText(100_000),
  image: z.string().trim().max(4000).default("noimage"),
  imageMediaId: z.coerce.number().int().positive().nullable().optional(),
  originMapId: z.coerce.number().int().positive().nullable().optional(),
  originCoordinateMode: z.enum(["xy", "latlng"]).nullable().optional(),
  originX: z.coerce.number().finite().nullable().optional(),
  originY: z.coerce.number().finite().nullable().optional(),
  originLat: z.coerce.number().finite().min(-90).max(90).nullable().optional(),
  originLng: z.coerce.number().finite().min(-180).max(180).nullable().optional(),
}).superRefine((value, context) => {
  if (value.originMapId == null) {
    if (value.originCoordinateMode != null || value.originX != null || value.originY != null || value.originLat != null || value.originLng != null) {
      context.addIssue({ code: "custom", message: "Ursprungskoordinaten benötigen eine Karte." });
    }
    return;
  }
  if (value.originCoordinateMode === "xy") {
    if (value.originX == null || value.originY == null || value.originLat != null || value.originLng != null) context.addIssue({ code: "custom", message: "Bildkarten benötigen X/Y-Koordinaten." });
    return;
  }
  if (value.originCoordinateMode === "latlng") {
    if (value.originLat == null || value.originLng == null || value.originX != null || value.originY != null) context.addIssue({ code: "custom", message: "Tile-Karten benötigen Breiten-/Längengrad." });
    return;
  }
  context.addIssue({ code: "custom", message: "Für den Ursprung fehlt der Koordinatenmodus." });
});

export type RaceInput = z.input<typeof raceInputSchema>;
export type RaceRow = {
  raceId: number;
  projectId: number;
  name: string;
  parentRaceId: number | null;
  parentName: string | null;
  isUnknown: boolean;
  masculineName: string | null;
  feminineName: string | null;
  hermaphroditeName: string | null;
  description: string | null;
  image: string;
  imageMediaId: number | null;
  originMapId: number | null;
  originCoordinateMode: "xy" | "latlng" | null;
  originX: number | null;
  originY: number | null;
  originLat: number | null;
  originLng: number | null;
  originMapName: string | null;
  originMapType: "image" | "tile" | null;
  characterCount: number;
  childCount: number;
};

const raceSelect = `SELECT r.race_id::int AS "raceId",r.project_id AS "projectId",r.name,
  r.parent_race_id::int AS "parentRaceId",p.name AS "parentName",r.is_unknown AS "isUnknown",
  r.masculine_name AS "masculineName",r.feminine_name AS "feminineName",r.hermaphrodite_name AS "hermaphroditeName",
  r.description,r.image,r.image_media_id::int AS "imageMediaId",r.origin_map_id::int AS "originMapId",
  r.origin_coordinate_mode AS "originCoordinateMode",r.origin_x AS "originX",r.origin_y AS "originY",r.origin_lat AS "originLat",r.origin_lng AS "originLng",
  pm.name AS "originMapName",pm.map_type AS "originMapType",
  (SELECT count(*)::int FROM charakters c JOIN npcs n2 ON n2.n_id=c.n_id WHERE c.race_id=r.race_id AND n2.camp_id=r.project_id AND n2.archived_at IS NULL) AS "characterCount",
  (SELECT count(*)::int FROM races child WHERE child.project_id=r.project_id AND child.parent_race_id=r.race_id AND child.archived_at IS NULL) AS "childCount"
  FROM races r
  LEFT JOIN races p ON p.project_id=r.project_id AND p.race_id=r.parent_race_id AND p.archived_at IS NULL
  LEFT JOIN project_maps pm ON pm.project_id=r.project_id AND pm.map_id=r.origin_map_id`;

function clean(value: string | null | undefined) { return value?.trim() || null; }

async function assertMedia(projectId: number, mediaId: number | null | undefined) {
  if (!mediaId) return;
  const result = await pool.query("SELECT 1 FROM media WHERE project_id=$1 AND media_id=$2", [projectId, mediaId]);
  if (result.rowCount !== 1) throw new Error("Das Vorschaubild gehört nicht zu dieser Welt.");
}

async function assertOriginMap(projectId: number, data: z.infer<typeof raceInputSchema>) {
  if (!data.originMapId) return;
  const result = await pool.query<{ map_type: "image" | "tile" }>("SELECT map_type FROM project_maps WHERE project_id=$1 AND map_id=$2", [projectId, data.originMapId]);
  if (result.rowCount !== 1) throw new Error("Die Ursprungskarte gehört nicht zu dieser Welt.");
  const expected = result.rows[0].map_type === "image" ? "xy" : "latlng";
  if (data.originCoordinateMode !== expected) throw new Error(result.rows[0].map_type === "image" ? "Diese Karte benötigt X/Y-Koordinaten." : "Diese Karte benötigt Breiten-/Längengrad.");
}

async function assertParentRace(projectId: number, parentRaceId: number | null | undefined, raceId?: number) {
  if (!parentRaceId) return;
  if (raceId && raceId === parentRaceId) throw new Error("Eine Spezies kann nicht ihre eigene übergeordnete Spezies sein.");
  const parent = await pool.query<{ parent_race_id: number | null; is_unknown: boolean }>(
    "SELECT parent_race_id::int,is_unknown FROM races WHERE project_id=$1 AND race_id=$2 AND archived_at IS NULL",
    [projectId, parentRaceId],
  );
  if (parent.rowCount !== 1) throw new Error("Die übergeordnete Spezies gehört nicht zu dieser Welt oder ist archiviert.");
  if (parent.rows[0].parent_race_id != null) throw new Error("Eine Subspezies kann nicht selbst übergeordnete Spezies sein.");
  if (parent.rows[0].is_unknown) throw new Error("Unter „Unbekannt“ können keine Subspezies angelegt werden.");
  if (raceId) {
    const children = await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM races WHERE project_id=$1 AND parent_race_id=$2 AND archived_at IS NULL", [projectId, raceId]);
    if ((children.rows[0]?.count ?? 0) > 0) throw new Error("Eine Spezies mit aktiven Subspezies kann nicht selbst zu einer Subspezies werden.");
  }
}

export async function listRaces(projectId: number) {
  const result = await pool.query<RaceRow>(`${raceSelect} WHERE r.project_id=$1 AND r.archived_at IS NULL ORDER BY r.is_unknown DESC,COALESCE(p.name,r.name),CASE WHEN r.parent_race_id IS NULL THEN 0 ELSE 1 END,r.name,r.race_id`, [projectId]);
  return result.rows;
}

export async function getRace(projectId: number, raceId: number) {
  const result = await pool.query<RaceRow>(`${raceSelect} WHERE r.project_id=$1 AND r.race_id=$2 AND r.archived_at IS NULL`, [projectId, raceId]);
  return result.rows[0] ?? null;
}

export function raceHierarchyLabel(race: Pick<RaceRow, "name" | "parentName" | "isUnknown">) {
  if (race.isUnknown) return "Unbekannt";
  return race.parentName ? `${race.parentName} → ${race.name}` : race.name;
}

export function raceNameForGender(race: Pick<RaceRow, "name" | "masculineName" | "feminineName" | "hermaphroditeName">, gender: PersonGender | string | null | undefined) {
  if (gender === "male") return clean(race.masculineName) ?? race.name;
  if (gender === "female") return clean(race.feminineName) ?? race.name;
  if (gender === "hermaphrodite") return clean(race.hermaphroditeName) ?? race.name;
  return race.name;
}

export async function createRace(projectId: number, input: RaceInput) {
  const data = raceInputSchema.parse(input);
  await Promise.all([assertMedia(projectId, data.imageMediaId), assertOriginMap(projectId, data), assertParentRace(projectId, data.parentRaceId)]);
  const result = await pool.query<{ race_id: number }>(`INSERT INTO races(project_id,name,parent_race_id,masculine_name,feminine_name,hermaphrodite_name,description,image,image_media_id,origin_map_id,origin_coordinate_mode,origin_x,origin_y,origin_lat,origin_lng,metadata)
    SELECT c.camp_id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'{}'::jsonb FROM campaigns c WHERE c.camp_id=$1 AND c.status<>'archived' RETURNING race_id`, [
    projectId, data.name, data.parentRaceId ?? null, clean(data.masculineName), clean(data.feminineName), clean(data.hermaphroditeName), clean(data.description), data.image || "noimage", data.imageMediaId ?? null,
    data.originMapId ?? null, data.originCoordinateMode ?? null, data.originX ?? null, data.originY ?? null, data.originLat ?? null, data.originLng ?? null,
  ]);
  if (result.rowCount !== 1) throw new Error("Welt wurde nicht gefunden oder ist archiviert.");
  const raceId = Number(result.rows[0].race_id);
  await pool.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','race.created','race',$2,$3::jsonb)`, [projectId, raceId, JSON.stringify({ name: data.name, parent_race_id: data.parentRaceId ?? null })]);
  return { raceId };
}

export async function updateRace(projectId: number, raceId: number, input: RaceInput) {
  const data = raceInputSchema.parse(input);
  const current = await pool.query<{ is_unknown: boolean }>("SELECT is_unknown FROM races WHERE project_id=$1 AND race_id=$2 AND archived_at IS NULL", [projectId, raceId]);
  if (current.rowCount !== 1) throw new Error("Spezies wurde nicht gefunden.");
  if (current.rows[0].is_unknown && (data.name.toLocaleLowerCase("de") !== "unbekannt" || data.parentRaceId != null)) throw new Error("Die System-Spezies „Unbekannt“ kann weder umbenannt noch untergeordnet werden.");
  await Promise.all([assertMedia(projectId, data.imageMediaId), assertOriginMap(projectId, data), assertParentRace(projectId, data.parentRaceId, raceId)]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(`UPDATE races SET name=$3,parent_race_id=$4,masculine_name=$5,feminine_name=$6,hermaphrodite_name=$7,description=$8,image=$9,image_media_id=$10,origin_map_id=$11,origin_coordinate_mode=$12,origin_x=$13,origin_y=$14,origin_lat=$15,origin_lng=$16,updated_at=now() WHERE project_id=$1 AND race_id=$2 AND archived_at IS NULL`, [
      projectId, raceId, data.name, data.parentRaceId ?? null, clean(data.masculineName), clean(data.feminineName), clean(data.hermaphroditeName), clean(data.description), data.image || "noimage", data.imageMediaId ?? null,
      data.originMapId ?? null, data.originCoordinateMode ?? null, data.originX ?? null, data.originY ?? null, data.originLat ?? null, data.originLng ?? null,
    ]);
    if (updated.rowCount !== 1) throw new Error("Spezies wurde nicht gefunden.");
    await client.query(`UPDATE charakters c SET race=$3 FROM npcs n WHERE c.n_id=n.n_id AND n.camp_id=$1 AND c.race_id=$2`, [projectId, raceId, data.name]);
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','race.updated','race',$2,$3::jsonb)`, [projectId, raceId, JSON.stringify({ name: data.name, parent_race_id: data.parentRaceId ?? null })]);
    await client.query("COMMIT");
    return { raceId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function archiveRace(projectId: number, raceId: number) {
  const race = await pool.query<{ is_unknown: boolean; character_count: number; child_count: number }>(`SELECT r.is_unknown,
    (SELECT count(*)::int FROM charakters c JOIN npcs n ON n.n_id=c.n_id WHERE n.camp_id=$1 AND c.race_id=r.race_id AND n.archived_at IS NULL) AS character_count,
    (SELECT count(*)::int FROM races child WHERE child.project_id=$1 AND child.parent_race_id=r.race_id AND child.archived_at IS NULL) AS child_count
    FROM races r WHERE r.project_id=$1 AND r.race_id=$2 AND r.archived_at IS NULL`, [projectId, raceId]);
  if (race.rowCount !== 1) throw new Error("Spezies wurde nicht gefunden.");
  if (race.rows[0].is_unknown) throw new Error("Die System-Spezies „Unbekannt“ kann nicht archiviert werden.");
  if (race.rows[0].character_count > 0) throw new Error("Diese Spezies wird noch von Characters verwendet und kann nicht archiviert werden.");
  if (race.rows[0].child_count > 0) throw new Error("Diese Spezies besitzt noch aktive Subspezies und kann nicht archiviert werden.");
  const result = await pool.query("UPDATE races SET archived_at=now(),updated_at=now() WHERE project_id=$1 AND race_id=$2 AND archived_at IS NULL", [projectId, raceId]);
  if (result.rowCount !== 1) throw new Error("Spezies wurde nicht gefunden.");
  await pool.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id) VALUES($1,'admin','race.archived','race',$2)`, [projectId, raceId]);
}
