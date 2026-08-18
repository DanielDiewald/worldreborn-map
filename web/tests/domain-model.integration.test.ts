import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

const databaseUrl=process.env.DATABASE_URL;
const dbTest=(name:string,fn:(pool:Pool)=>Promise<void>)=>test(name,{skip:!databaseUrl},async()=>{const pool=new Pool({connectionString:databaseUrl});try{await fn(pool);}finally{await pool.end();}});
async function count(pool:Pool,sql:string,params:unknown[]=[]){const r=await pool.query<{value:number|string}>(sql,params);return Number(r.rows[0]?.value??0);}

dbTest("legacy rows and person partition survive migration",async(pool)=>{
  const expected:Record<string,number>={campaigns:1,npcs:130,charakters:114,gods:16,chars:0,users:5,locations:26,groups:18,is_part_of:44,events:0,parent_child_relationships:53,romantic_relationships:19};
  for(const [table,value] of Object.entries(expected))assert.equal(await count(pool,`SELECT count(*) value FROM ${table}`),value,table);
  assert.equal(await count(pool,"SELECT count(*) value FROM npcs n JOIN charakters c ON c.n_id=n.n_id"),114);
  assert.equal(await count(pool,"SELECT count(*) value FROM npcs n JOIN gods g ON g.n_id=n.n_id"),16);
  assert.equal(await count(pool,"SELECT count(*) value FROM npcs n WHERE EXISTS(SELECT 1 FROM charakters c WHERE c.n_id=n.n_id) AND EXISTS(SELECT 1 FROM gods g WHERE g.n_id=n.n_id)"),0);
});

dbTest("legacy group memberships translate char_id to canonical n_id without changing groups.members",async(pool)=>{
  assert.equal(await count(pool,"SELECT count(*) value FROM group_memberships WHERE metadata->>'legacy_source'='is_part_of'"),44);
  assert.equal(await count(pool,`SELECT count(*) value FROM is_part_of i JOIN charakters c ON c.char_id=i.char_id JOIN npcs n ON n.n_id=c.n_id JOIN group_memberships gm ON gm.project_id=n.camp_id AND gm.group_id=i.gr_id AND gm.entity_type='person' AND gm.entity_id=c.n_id WHERE gm.metadata->>'legacy_source'='is_part_of'`),44);
  const rows=await pool.query<{name:string;members:number}>("SELECT name,members FROM groups WHERE name IN ('Putschists','Johnsen Johnsen','The Holyknights') ORDER BY name");
  const values=new Map(rows.rows.map(r=>[r.name,r.members]));
  assert.equal(values.get("Putschists"),2000);assert.equal(values.get("Johnsen Johnsen"),4000);assert.equal(values.get("The Holyknights"),2000);
});

dbTest("all generic person references use person plus n_id",async(pool)=>{
  const legacy=await count(pool,`SELECT
    (SELECT count(*) FROM relationships WHERE entity_a_type IN ('npc','character','god') OR entity_b_type IN ('npc','character','god'))+
    (SELECT count(*) FROM entity_visibility WHERE entity_type IN ('npc','character','god'))+
    (SELECT count(*) FROM player_entity_variants WHERE entity_type IN ('npc','character','god') AND entity_id IS NOT NULL)+
    (SELECT count(*) FROM entity_tags WHERE entity_type IN ('npc','character','god'))+
    (SELECT count(*) FROM timeline_links WHERE entity_type IN ('npc','character','god'))+
    (SELECT count(*) FROM map_markers WHERE entity_type IN ('npc','character','god'))+
    (SELECT count(*) FROM media WHERE entity_type IN ('npc','character','god'))+
    (SELECT count(*) FROM group_memberships WHERE entity_type IN ('npc','character','god')) value`);
  assert.equal(legacy,0);
  assert.equal(await count(pool,"SELECT count(*) value FROM relationships r WHERE r.entity_a_type='person' AND NOT EXISTS(SELECT 1 FROM npcs n WHERE n.n_id=r.entity_a_id AND n.camp_id=r.project_id)"),0);
  assert.equal(await count(pool,"SELECT count(*) value FROM relationships r WHERE r.entity_b_type='person' AND NOT EXISTS(SELECT 1 FROM npcs n WHERE n.n_id=r.entity_b_id AND n.camp_id=r.project_id)"),0);
});

dbTest("romantic legacy semantics remain reconstructable",async(pool)=>{
  assert.equal(await count(pool,"SELECT count(*) value FROM relationships WHERE metadata->>'legacy_source'='romantic_relationships'"),19);
  const id14=await pool.query<{code:string;status:string;legacy_type:string;marriage:string;divorced:string;conflict:string}>(`SELECT rt.code,r.status,r.metadata->>'legacy_type' AS legacy_type,r.metadata->>'marriage' AS marriage,r.metadata->>'divorced' AS divorced,r.metadata->>'conflict' AS conflict FROM relationships r JOIN relationship_types rt ON rt.relationship_type_id=r.relationship_type_id WHERE r.metadata->>'legacy_source'='romantic_relationships' AND r.metadata->>'legacy_id'='14'`);
  assert.equal(id14.rowCount,1);assert.equal(id14.rows[0].code,"ex_partner");assert.equal(id14.rows[0].status,"ended");assert.equal(id14.rows[0].marriage,"true");assert.equal(id14.rows[0].divorced,"true");assert.equal(id14.rows[0].conflict,"true");
  assert.equal(await count(pool,"SELECT count(*) value FROM relationships r JOIN relationship_types rt ON rt.relationship_type_id=r.relationship_type_id WHERE r.metadata->>'legacy_source'='romantic_relationships' AND lower(r.metadata->>'legacy_type')='friend' AND rt.code<>'friend'"),0);
});
