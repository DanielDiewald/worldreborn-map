import { Client } from "pg";
import {
  loadProjectEnvironment,
  requireDatabaseUrl,
} from "../src/lib/environment";

type LegacyMarker = {
  sourceKey: string;
  type: "party_location" | "player_origin";
  label: string;
  lat: number;
  lng: number;
  icon?: string;
  npcCandidates?: string[];
};

const markers: LegacyMarker[] = [
  {
    sourceKey: "legacy-party-location",
    type: "party_location",
    label: "Party Location",
    lat: 50.190968,
    lng: 113.115234,
  },
  {
    sourceKey: "legacy-player-raphael",
    type: "player_origin",
    label: "Prinz Ferguson of Erigon",
    lat: 50.999929,
    lng: 60.820313,
    icon: "icons/players/rl.png",
    npcCandidates: ["Prinz Ferguson of Erigon", "Prince Ferguson of Erigon"],
  },
  {
    sourceKey: "legacy-player-philipp",
    type: "player_origin",
    label: "Dr. Jake Brigance",
    lat: 50.092393,
    lng: 113.48877,
    icon: "icons/players/pm.png",
    npcCandidates: ["Dr. Jake Brigance"],
  },
  {
    sourceKey: "legacy-player-mark",
    type: "player_origin",
    label: "Xarrakas Valthaash",
    lat: 50.092393,
    lng: 112.719727,
    icon: "icons/players/ms.png",
    npcCandidates: ["Xarrakas Valthaash"],
  },
  {
    sourceKey: "legacy-player-niki",
    type: "player_origin",
    label: "Aaron Orphos",
    lat: 60.370429,
    lng: 138.29898,
    icon: "icons/players/nk.png",
    npcCandidates: ["Aaron Orphos"],
  },
  {
    sourceKey: "legacy-player-luke",
    type: "player_origin",
    label: "Lonhard Brightshield",
    lat: 50.44313,
    lng: 101.68943,
    icon: "icons/players/ls.png",
    npcCandidates: ["Lonhard Brightshield"],
  },
  {
    sourceKey: "legacy-player-stefan",
    type: "player_origin",
    label: "Arctos",
    lat: 43.149094,
    lng: -96.49961,
    icon: "icons/players/sg.png",
    npcCandidates: ["Arctos"],
  },
];

async function main() {
  loadProjectEnvironment();
  const connectionString = requireDatabaseUrl();
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query("BEGIN");

    const projectId = 1;
    const mapResult = await client.query<{ map_id: string }>(
      `SELECT map_id
         FROM project_maps
        WHERE project_id = $1
          AND is_primary = true
        ORDER BY map_id
        LIMIT 1`,
      [projectId],
    );

    if (mapResult.rowCount !== 1) {
      throw new Error("Aetheris primary map is missing. Run npm run db:migrate first.");
    }

    const mapId = mapResult.rows[0].map_id;

    for (const marker of markers) {
      let entityType: string | null = null;
      let entityId: number | null = null;

      if (marker.npcCandidates?.length) {
        const npcResult = await client.query<{ n_id: number; name: string }>(
          `SELECT n_id, name
             FROM npcs
            WHERE camp_id = $1
              AND lower(name) = ANY($2::text[])`,
          [projectId, marker.npcCandidates.map((name) => name.toLowerCase())],
        );

        if (npcResult.rowCount === 1) {
          entityType = "npc";
          entityId = npcResult.rows[0].n_id;
        }
      }

      await client.query(
        `INSERT INTO map_markers (
           project_id, map_id, marker_type, source_key, entity_type, entity_id,
           coordinate_mode, lat, lng, icon, label, visibility_mode, layer, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, 'latlng', $7, $8, $9, $10, 'admin_only', $11, $12::jsonb)
         ON CONFLICT (project_id, map_id, source_key)
         WHERE source_key IS NOT NULL
         DO UPDATE SET
           marker_type = EXCLUDED.marker_type,
           entity_type = EXCLUDED.entity_type,
           entity_id = EXCLUDED.entity_id,
           lat = EXCLUDED.lat,
           lng = EXCLUDED.lng,
           icon = EXCLUDED.icon,
           label = EXCLUDED.label,
           updated_at = now()`,
        [
          projectId,
          mapId,
          marker.type,
          marker.sourceKey,
          entityType,
          entityId,
          marker.lat,
          marker.lng,
          marker.icon ?? null,
          marker.label,
          marker.type === "player_origin" ? "players" : "party",
          JSON.stringify({ imported_from: "legacy index.html" }),
        ],
      );
    }

    await client.query("COMMIT");
    console.log(`Imported ${markers.length} legacy markers into project ${projectId}.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Legacy map import failed: ${message}`, { cause: error });
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
