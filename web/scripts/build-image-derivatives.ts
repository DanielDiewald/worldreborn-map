import { loadProjectEnvironment } from "../src/lib/environment";

loadProjectEnvironment();

type Candidate = { project_id: number; entity_type: "person"|"race"|"culture"|"group"|"location"; entity_id: number };

async function main() {
  const [{ pool }, { ensureEntityAvatarDerivative }] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/entity-image-derivatives"),
  ]);
  try {
    const result = await pool.query<Candidate>(`
      SELECT camp_id AS project_id,'person'::text AS entity_type,n_id AS entity_id FROM npcs WHERE archived_at IS NULL AND image ~ '^/api/media/[0-9]+$'
      UNION ALL
      SELECT project_id,'race',race_id FROM races WHERE archived_at IS NULL AND image ~ '^/api/media/[0-9]+$'
      UNION ALL
      SELECT project_id,'culture',culture_id FROM cultures WHERE archived_at IS NULL AND image ~ '^/api/media/[0-9]+$'
      UNION ALL
      SELECT camp_id,'group',gr_id FROM groups WHERE archived_at IS NULL AND image ~ '^/api/media/[0-9]+$'
      UNION ALL
      SELECT camp_id,'location',loc_id FROM locations WHERE archived_at IS NULL AND coat_of_arm ~ '^/api/media/[0-9]+$'
      ORDER BY project_id,entity_type,entity_id
    `);
    let built = 0, skipped = 0, failed = 0;
    // Keep the backfill intentionally gentle: image decoding can be CPU/memory heavy and this is
    // a maintenance command, not a throughput benchmark.
    for (const candidate of result.rows) {
      try {
        const derivative = await ensureEntityAvatarDerivative(Number(candidate.project_id), candidate.entity_type, Number(candidate.entity_id));
        if (derivative) built += 1; else skipped += 1;
      } catch (error) {
        failed += 1;
        console.error(`Avatar failed for ${candidate.entity_type} #${candidate.entity_id}:`, error instanceof Error ? error.message : error);
      }
    }
    console.log(`Avatar derivatives ready: ${built}; skipped: ${skipped}; failed: ${failed}; candidates: ${result.rows.length}`);
    if (failed) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
