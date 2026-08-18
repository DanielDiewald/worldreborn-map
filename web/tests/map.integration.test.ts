import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

const databaseUrl=process.env.DATABASE_URL;
const dbTest=(name:string,fn:(pool:Pool)=>Promise<void>)=>test(name,{skip:!databaseUrl},async()=>{
  const pool=new Pool({connectionString:databaseUrl});
  try{await fn(pool);}finally{await pool.end();}
});

async function visibleMarkerIds(pool:Pool,projectId:number,mapId:number,playerId:number){
  const result=await pool.query<{marker_id:string}>(`
    SELECT m.marker_id
      FROM map_markers m
      JOIN users u ON u.user_id=$3 AND u.camp_id=$1 AND u.active=true
      LEFT JOIN entity_visibility mv
        ON mv.project_id=m.project_id
       AND mv.player_id=$3
       AND mv.entity_type='map_marker'
       AND mv.entity_id=m.marker_id
     WHERE m.project_id=$1
       AND m.map_id=$2
       AND COALESCE(mv.visible,m.visibility_mode='all_players')
       AND (
         m.entity_type IS NULL OR CASE m.entity_type
           WHEN 'person' THEN EXISTS(
             SELECT 1
               FROM npcs n
               LEFT JOIN entity_visibility ev
                 ON ev.project_id=n.camp_id AND ev.player_id=$3 AND ev.entity_type='person' AND ev.entity_id=n.n_id
              WHERE n.camp_id=$1 AND n.n_id=m.entity_id AND n.archived_at IS NULL
                AND COALESCE(ev.visible,n.visibility_mode='all_players')
           )
           ELSE true
         END
       )
     ORDER BY m.marker_id`,[projectId,mapId,playerId]);
  return result.rows.map((row)=>Number(row.marker_id));
}

dbTest("selected-player map markers are visible only to explicitly selected active players",async(pool)=>{
  const map=await pool.query<{project_id:number;map_id:number}>("SELECT project_id,map_id FROM project_maps ORDER BY is_primary DESC,map_id LIMIT 1");
  assert.equal(map.rowCount,1);
  const {project_id:projectId,map_id:mapId}=map.rows[0];
  const players=await pool.query<{user_id:number}>("SELECT user_id FROM users WHERE camp_id=$1 AND active=true ORDER BY user_id LIMIT 2",[projectId]);
  assert.ok(players.rows.length>=2,"fixture needs two active players");
  const [allowed,other]=players.rows;
  const marker=await pool.query<{marker_id:number}>(`
    INSERT INTO map_markers(project_id,map_id,marker_type,coordinate_mode,lat,lng,label,visibility_mode,layer)
    VALUES($1,$2,'landmark','latlng',0,0,'Map visibility integration marker','selected_players','integration-test')
    RETURNING marker_id`,[projectId,mapId]);
  const markerId=Number(marker.rows[0].marker_id);
  try{
    await pool.query(`INSERT INTO entity_visibility(project_id,player_id,entity_type,entity_id,visible) VALUES($1,$2,'map_marker',$3,true)`,[projectId,allowed.user_id,markerId]);
    assert.ok((await visibleMarkerIds(pool,projectId,mapId,allowed.user_id)).includes(markerId));
    assert.ok(!(await visibleMarkerIds(pool,projectId,mapId,other.user_id)).includes(markerId));
  }finally{
    await pool.query("DELETE FROM entity_visibility WHERE project_id=$1 AND entity_type='map_marker' AND entity_id=$2",[projectId,markerId]);
    await pool.query("DELETE FROM map_markers WHERE project_id=$1 AND map_id=$2 AND marker_id=$3",[projectId,mapId,markerId]);
  }
});

dbTest("map markers use canonical person+n_id and linked person visibility remains server-side",async(pool)=>{
  const map=await pool.query<{project_id:number;map_id:number}>("SELECT project_id,map_id FROM project_maps ORDER BY is_primary DESC,map_id LIMIT 1");
  assert.equal(map.rowCount,1);
  const {project_id:projectId,map_id:mapId}=map.rows[0];
  const player=await pool.query<{user_id:number}>("SELECT user_id FROM users WHERE camp_id=$1 AND active=true ORDER BY user_id LIMIT 1",[projectId]);
  assert.equal(player.rowCount,1);
  const person=await pool.query<{n_id:number;char_id:number}>(`SELECT n.n_id,c.char_id FROM npcs n JOIN charakters c ON c.n_id=n.n_id WHERE n.camp_id=$1 AND n.archived_at IS NULL AND c.char_id<>n.n_id ORDER BY n.n_id LIMIT 1`,[projectId]);
  assert.equal(person.rowCount,1);
  const {n_id:nId,char_id:charId}=person.rows[0];
  assert.notEqual(nId,charId,"fixture must prove subtype ID differs from canonical person ID");
  const marker=await pool.query<{marker_id:number}>(`
    INSERT INTO map_markers(project_id,map_id,marker_type,entity_type,entity_id,coordinate_mode,lat,lng,label,visibility_mode,layer)
    VALUES($1,$2,'person','person',$3,'latlng',0,0,'Canonical person map marker','all_players','integration-test')
    RETURNING marker_id`,[projectId,mapId,nId]);
  const markerId=Number(marker.rows[0].marker_id);
  try{
    const stored=await pool.query<{entity_type:string;entity_id:string}>("SELECT entity_type,entity_id FROM map_markers WHERE marker_id=$1",[markerId]);
    assert.equal(stored.rows[0].entity_type,"person");
    assert.equal(Number(stored.rows[0].entity_id),nId);

    await pool.query(`INSERT INTO entity_visibility(project_id,player_id,entity_type,entity_id,visible) VALUES($1,$2,'person',$3,false) ON CONFLICT(project_id,player_id,entity_type,entity_id) DO UPDATE SET visible=false,updated_at=now()`,[projectId,player.rows[0].user_id,nId]);
    assert.ok(!(await visibleMarkerIds(pool,projectId,mapId,player.rows[0].user_id)).includes(markerId));
  }finally{
    await pool.query("DELETE FROM entity_visibility WHERE project_id=$1 AND player_id=$2 AND entity_type='person' AND entity_id=$3",[projectId,player.rows[0].user_id,nId]);
    await pool.query("DELETE FROM map_markers WHERE project_id=$1 AND map_id=$2 AND marker_id=$3",[projectId,mapId,markerId]);
  }
});
