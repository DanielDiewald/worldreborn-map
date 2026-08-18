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

dbTest("modern Character membership keeps is_part_of shadow in sync and preserves estimated size",async(pool)=>{
  const candidate=await pool.query<{project_id:number;group_id:number;person_id:number;char_id:number;estimated:number}>(`SELECT n.camp_id AS project_id,g.gr_id AS group_id,n.n_id AS person_id,c.char_id,g.members AS estimated FROM charakters c JOIN npcs n ON n.n_id=c.n_id JOIN groups g ON g.camp_id=n.camp_id WHERE n.archived_at IS NULL AND g.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM group_memberships gm WHERE gm.project_id=n.camp_id AND gm.group_id=g.gr_id AND gm.entity_type='person' AND gm.entity_id=n.n_id) AND NOT EXISTS(SELECT 1 FROM is_part_of i WHERE i.gr_id=g.gr_id AND i.char_id=c.char_id) ORDER BY n.n_id,g.gr_id LIMIT 1`);
  assert.equal(candidate.rowCount,1);const c=candidate.rows[0];
  try{
    await pool.query("SELECT public.upsert_person_group_membership($1,$2,$3,'member','test-rank','active',false,NULL,NULL,'integration test')",[c.project_id,c.group_id,c.person_id]);
    assert.equal(await count(pool,"SELECT count(*) value FROM is_part_of WHERE gr_id=$1 AND char_id=$2",[c.group_id,c.char_id]),1);
    assert.equal(await count(pool,"SELECT count(*) value FROM group_memberships WHERE project_id=$1 AND group_id=$2 AND entity_type='person' AND entity_id=$3 AND rank_label='test-rank' AND membership_status='active'",[c.project_id,c.group_id,c.person_id]),1);
    assert.equal(await count(pool,"SELECT members value FROM groups WHERE gr_id=$1",[c.group_id]),c.estimated);
    await pool.query("SELECT public.delete_person_group_membership($1,$2,$3)",[c.project_id,c.group_id,c.person_id]);
    assert.equal(await count(pool,"SELECT count(*) value FROM is_part_of WHERE gr_id=$1 AND char_id=$2",[c.group_id,c.char_id]),0);
    assert.equal(await count(pool,"SELECT members value FROM groups WHERE gr_id=$1",[c.group_id]),c.estimated);
  }finally{
    await pool.query("SELECT public.delete_person_group_membership($1,$2,$3)",[c.project_id,c.group_id,c.person_id]);
    await pool.query("DELETE FROM is_part_of WHERE gr_id=$1 AND char_id=$2",[c.group_id,c.char_id]);
  }
});

dbTest("modern God membership stays canonical without is_part_of shadow",async(pool)=>{
  const candidate=await pool.query<{project_id:number;group_id:number;person_id:number}>(`SELECT n.camp_id AS project_id,g.gr_id AS group_id,n.n_id AS person_id FROM gods gd JOIN npcs n ON n.n_id=gd.n_id JOIN groups g ON g.camp_id=n.camp_id WHERE n.archived_at IS NULL AND g.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM group_memberships gm WHERE gm.project_id=n.camp_id AND gm.group_id=g.gr_id AND gm.entity_type='person' AND gm.entity_id=n.n_id) ORDER BY n.n_id,g.gr_id LIMIT 1`);
  assert.equal(candidate.rowCount,1);const c=candidate.rows[0];
  try{
    await pool.query("SELECT public.upsert_person_group_membership($1,$2,$3,'deity',NULL,'active',false,NULL,NULL,NULL)",[c.project_id,c.group_id,c.person_id]);
    assert.equal(await count(pool,"SELECT count(*) value FROM group_memberships WHERE project_id=$1 AND group_id=$2 AND entity_type='person' AND entity_id=$3",[c.project_id,c.group_id,c.person_id]),1);
    assert.equal(await count(pool,"SELECT count(*) value FROM is_part_of i JOIN charakters ch ON ch.char_id=i.char_id WHERE i.gr_id=$1 AND ch.n_id=$2",[c.group_id,c.person_id]),0);
  }finally{await pool.query("SELECT public.delete_person_group_membership($1,$2,$3)",[c.project_id,c.group_id,c.person_id]);}
});

dbTest("named family tree can contain Character and God persons",async(pool)=>{
  const character=await pool.query<{project_id:number;person_id:number}>("SELECT n.camp_id AS project_id,n.n_id AS person_id FROM charakters c JOIN npcs n ON n.n_id=c.n_id WHERE n.archived_at IS NULL ORDER BY n.n_id LIMIT 1");
  assert.equal(character.rowCount,1);const projectId=character.rows[0].project_id;
  const god=await pool.query<{person_id:number}>("SELECT n.n_id AS person_id FROM gods g JOIN npcs n ON n.n_id=g.n_id WHERE n.camp_id=$1 AND n.archived_at IS NULL ORDER BY n.n_id LIMIT 1",[projectId]);
  assert.equal(god.rowCount,1);
  const tree=await pool.query<{tree_id:number}>("INSERT INTO family_trees(project_id,name,root_person_id,visibility_mode) VALUES($1,'Integration Test Family',$2,'admin_only') RETURNING family_tree_id AS tree_id",[projectId,character.rows[0].person_id]);
  const treeId=tree.rows[0].tree_id;
  try{
    await pool.query("INSERT INTO family_tree_members(family_tree_id,person_id,role_label) VALUES($1,$2,'Root'),($1,$3,'Divine branch')",[treeId,character.rows[0].person_id,god.rows[0].person_id]);
    assert.equal(await count(pool,"SELECT count(*) value FROM family_tree_members WHERE family_tree_id=$1",[treeId]),2);
  }finally{await pool.query("DELETE FROM family_trees WHERE project_id=$1 AND family_tree_id=$2",[projectId,treeId]);}
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
