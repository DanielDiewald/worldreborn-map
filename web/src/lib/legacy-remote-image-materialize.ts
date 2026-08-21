import "server-only";

import path from "node:path";
import { pool } from "@/lib/db";
import { validateImageBuffer } from "@/lib/image-validation";
import { downloadRemoteImage } from "@/lib/remote-image";
import { localStorage } from "@/lib/storage";

export type MaterializableImageEntityType = "person" | "race" | "culture" | "group" | "location";

const CONFIG: Record<MaterializableImageEntityType, { table: string; project: string; id: string; image: string; croppable: boolean }> = {
  person: { table: "npcs", project: "camp_id", id: "n_id", image: "image", croppable: true },
  race: { table: "races", project: "project_id", id: "race_id", image: "image", croppable: true },
  culture: { table: "cultures", project: "project_id", id: "culture_id", image: "image", croppable: true },
  group: { table: "groups", project: "camp_id", id: "gr_id", image: "image", croppable: false },
  location: { table: "locations", project: "camp_id", id: "loc_id", image: "coat_of_arm", croppable: false },
};

function remoteFilename(finalUrl: string, extension: string) {
  try {
    const filename = path.basename(new URL(finalUrl).pathname);
    if (filename) return filename.slice(0, 500);
  } catch {
    // The downloader already validated the URL; this is only display metadata.
  }
  return `remote-image.${extension}`;
}

export async function materializeLegacyRemoteEntityImage(projectId: number, entityType: MaterializableImageEntityType, entityId: number, sourceImage: string) {
  const downloaded = await downloadRemoteImage(sourceImage);
  const image = validateImageBuffer(downloaded.buffer);
  const saved = await localStorage.save(downloaded.buffer, image.extension);
  const config = CONFIG[entityType];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const media = await client.query<{ media_id: string }>(
      `INSERT INTO media(project_id,entity_type,entity_id,original_filename,stored_filename,storage_path,external_url,mime_type,size_bytes,title,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING media_id`,
      [projectId, entityType, entityId, remoteFilename(downloaded.finalUrl, image.extension), saved.storedFilename, saved.storagePath, downloaded.requestedUrl, image.mimeType, downloaded.buffer.length, "Importiertes Entity-Bild", JSON.stringify({ width: image.width, height: image.height, remote_requested_url: downloaded.requestedUrl, remote_final_url: downloaded.finalUrl, remote_cached: true, legacy_materialized: true })],
    );
    const mediaId = Number(media.rows[0].media_id);
    const managedImage = `/api/media/${mediaId}`;
    const updated = await client.query(
      `UPDATE ${config.table} SET ${config.image}=$4,image_media_id=$5,updated_at=now() WHERE ${config.project}=$1 AND ${config.id}=$2 AND ${config.image}=$3`,
      [projectId, entityId, sourceImage, managedImage, mediaId],
    );
    if (updated.rowCount !== 1) {
      await client.query("ROLLBACK");
      await localStorage.delete(saved.storagePath).catch(() => undefined);
      return null;
    }
    if (config.croppable) {
      await client.query(
        "UPDATE entity_image_crops SET source_image=$4,updated_at=now() WHERE project_id=$1 AND entity_type=$2 AND entity_id=$3 AND source_image=$5",
        [projectId, entityType, entityId, managedImage, sourceImage],
      );
    }
    await client.query(
      "INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'system','media.remote_materialized',$2,$3,$4::jsonb)",
      [projectId, entityType, entityId, JSON.stringify({ media_id: mediaId, source_url: downloaded.requestedUrl, final_url: downloaded.finalUrl })],
    );
    await client.query("COMMIT");
    return {
      managedImage,
      sourceKey: `media:${mediaId}:${saved.storagePath}`,
      sourceMediaId: mediaId,
      read: () => localStorage.read(saved.storagePath),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    await localStorage.delete(saved.storagePath).catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
