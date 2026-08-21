import "server-only";

import { pool } from "@/lib/db";

export const ANCESTRY_RELATION_OPTIONS = [
  { value: "ancestry", label: "Abstammung" },
  { value: "parental", label: "Elterliche Herkunft" },
  { value: "heritage", label: "Weiteres Erbe" },
] as const;
export type AncestryRelation = (typeof ANCESTRY_RELATION_OPTIONS)[number]["value"];

export type CharacterAncestryRow = { ancestryId: number; raceId: number; raceName: string; parentName: string | null; relation: AncestryRelation; notes: string | null; visibleToPlayer: boolean };
export type PersonCultureRow = { cultureId: number; cultureName: string; isPrimary: boolean; notes: string | null; visibleToPlayer: boolean };

function clean(value: string | null | undefined) { return value?.trim() || null; }
async function assertCharacter(projectId:number,charId:number){const row=await pool.query("SELECT 1 FROM charakters ch JOIN npcs n ON n.n_id=ch.n_id WHERE n.camp_id=$1 AND ch.char_id=$2 AND n.archived_at IS NULL",[projectId,charId]);if(row.rowCount!==1)throw new Error("Der Charakter wurde nicht gefunden oder gehört nicht zu dieser Welt.");}
async function assertRace(projectId:number,raceId:number){const row=await pool.query("SELECT 1 FROM races WHERE project_id=$1 AND race_id=$2 AND archived_at IS NULL AND is_unknown=false",[projectId,raceId]);if(row.rowCount!==1)throw new Error("Die ausgewählte Spezies gehört nicht zu dieser Welt, ist archiviert oder ist der System-Fallback „Unbekannt“.");}
async function assertPerson(projectId:number,personId:number){const row=await pool.query("SELECT 1 FROM npcs WHERE camp_id=$1 AND n_id=$2 AND archived_at IS NULL",[projectId,personId]);if(row.rowCount!==1)throw new Error("Die Person wurde nicht gefunden oder gehört nicht zu dieser Welt.");}
async function assertCulture(projectId:number,cultureId:number){const row=await pool.query("SELECT 1 FROM cultures WHERE project_id=$1 AND culture_id=$2 AND archived_at IS NULL",[projectId,cultureId]);if(row.rowCount!==1)throw new Error("Die ausgewählte Kultur gehört nicht zu dieser Welt oder ist archiviert.");}

export async function listCharacterAncestry(projectId: number, charId: number) {
  const result = await pool.query<CharacterAncestryRow>(`SELECT ca.ancestry_id::int AS "ancestryId",ca.race_id::int AS "raceId",r.name AS "raceName",p.name AS "parentName",ca.relation,ca.notes,ca.visible_to_player AS "visibleToPlayer" FROM character_ancestry ca JOIN races r ON r.project_id=ca.project_id AND r.race_id=ca.race_id AND r.archived_at IS NULL LEFT JOIN races p ON p.project_id=r.project_id AND p.race_id=r.parent_race_id AND p.archived_at IS NULL WHERE ca.project_id=$1 AND ca.char_id=$2 ORDER BY CASE ca.relation WHEN 'parental' THEN 0 WHEN 'ancestry' THEN 1 ELSE 2 END,COALESCE(p.name,r.name),r.name`, [projectId,charId]);
  return result.rows;
}

export async function addCharacterAncestry(projectId: number, charId: number, raceId: number, relation: AncestryRelation, notes?: string | null, visibleToPlayer = false) {
  if (!ANCESTRY_RELATION_OPTIONS.some((option) => option.value === relation)) throw new Error("Ungültige Abstammungsart.");
  await Promise.all([assertCharacter(projectId,charId),assertRace(projectId,raceId)]);
  await pool.query(`INSERT INTO character_ancestry(project_id,char_id,race_id,relation,notes,visible_to_player) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(char_id,race_id,relation) DO UPDATE SET notes=EXCLUDED.notes,visible_to_player=EXCLUDED.visible_to_player`, [projectId,charId,raceId,relation,clean(notes),visibleToPlayer]);
}
export async function deleteCharacterAncestry(projectId: number, charId: number, ancestryId: number) { await assertCharacter(projectId,charId);const result=await pool.query("DELETE FROM character_ancestry WHERE project_id=$1 AND char_id=$2 AND ancestry_id=$3", [projectId,charId,ancestryId]);if(result.rowCount!==1)throw new Error("Die Abstammung wurde nicht gefunden oder bereits entfernt."); }

export async function listPersonCultures(projectId: number, personId: number) {
  const result = await pool.query<PersonCultureRow>(`SELECT pc.culture_id::int AS "cultureId",c.name AS "cultureName",pc.is_primary AS "isPrimary",pc.notes,pc.visible_to_player AS "visibleToPlayer" FROM person_cultures pc JOIN cultures c ON c.project_id=pc.project_id AND c.culture_id=pc.culture_id AND c.archived_at IS NULL WHERE pc.project_id=$1 AND pc.person_id=$2 ORDER BY pc.is_primary DESC,c.name`, [projectId,personId]);
  return result.rows;
}
export async function addPersonCulture(projectId: number, personId: number, cultureId: number, isPrimary = false, notes?: string | null, visibleToPlayer = false) {
  await Promise.all([assertPerson(projectId,personId),assertCulture(projectId,cultureId)]);
  const client = await pool.connect(); try { await client.query("BEGIN"); if (isPrimary) await client.query("UPDATE person_cultures SET is_primary=false WHERE project_id=$1 AND person_id=$2",[projectId,personId]); await client.query(`INSERT INTO person_cultures(project_id,person_id,culture_id,is_primary,notes,visible_to_player) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(person_id,culture_id) DO UPDATE SET is_primary=EXCLUDED.is_primary,notes=EXCLUDED.notes,visible_to_player=EXCLUDED.visible_to_player`,[projectId,personId,cultureId,isPrimary,clean(notes),visibleToPlayer]); await client.query("COMMIT"); } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
}
export async function deletePersonCulture(projectId: number, personId: number, cultureId: number) { await assertPerson(projectId,personId);const result=await pool.query("DELETE FROM person_cultures WHERE project_id=$1 AND person_id=$2 AND culture_id=$3", [projectId,personId,cultureId]);if(result.rowCount!==1)throw new Error("Die Kulturzuordnung wurde nicht gefunden oder bereits entfernt."); }
