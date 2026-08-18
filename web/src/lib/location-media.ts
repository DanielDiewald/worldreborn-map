import "server-only";

import { pool } from "@/lib/db";
import { bindMediaToEntity, type EntityImageSource } from "@/lib/media";

export async function setLocationImageReference(projectId:number,locationId:number,source:EntityImageSource){const result=await pool.query("UPDATE locations SET coat_of_arm=$3,image_media_id=$4,updated_at=now() WHERE camp_id=$1 AND loc_id=$2 AND archived_at IS NULL",[projectId,locationId,source.image==="noimage"?null:source.image,source.mediaId]);if(result.rowCount!==1)throw new Error("Location not found in this project.");if(source.mediaId)await bindMediaToEntity(projectId,source.mediaId,"location",locationId);}
