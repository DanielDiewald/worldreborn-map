import "server-only";

import { pool } from "@/lib/db";
import { parseDeathCauseCode } from "@/lib/death-causes";

export async function savePersonDeathMetadata(
  projectId: number,
  personId: number,
  alive: boolean,
  rawCauseCode: unknown,
  rawCauseDetail: unknown,
) {
  const rawCode = String(rawCauseCode ?? "").trim();
  const causeCode = alive ? null : parseDeathCauseCode(rawCode);
  if (!alive && rawCode && !causeCode) throw new Error("Ungültige Todesursache.");

  const detail = alive ? null : String(rawCauseDetail ?? "").trim() || null;
  if (detail && detail.length > 1000) throw new Error("Details zur Todesursache dürfen höchstens 1000 Zeichen lang sein.");

  const result = await pool.query(
    `UPDATE npcs
        SET metadata=(COALESCE(metadata,'{}'::jsonb) - 'death_cause_code' - 'death_cause_detail')
          || jsonb_strip_nulls(jsonb_build_object('death_cause_code',$3::text,'death_cause_detail',$4::text)),
            updated_at=now()
      WHERE camp_id=$1 AND n_id=$2 AND archived_at IS NULL`,
    [projectId, personId, causeCode, detail],
  );
  if (result.rowCount !== 1) throw new Error("Person gehört nicht zu diesem Projekt.");
}
