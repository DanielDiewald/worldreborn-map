import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

const databaseUrl=process.env.DATABASE_URL;
const dbTest=(name:string,fn:(pool:Pool)=>Promise<void>)=>test(name,{skip:!databaseUrl},async()=>{const pool=new Pool({connectionString:databaseUrl});try{await fn(pool);}finally{await pool.end();}});

type PlanRoot={"Planning Time"?:number;"Execution Time"?:number;Plan?:{"Node Type"?:string;"Actual Rows"?:number;"Shared Hit Blocks"?:number;"Shared Read Blocks"?:number}};
async function explain(pool:Pool,label:string,sql:string,params:unknown[]){
  const result=await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,params);
  const payload=result.rows[0]?.["QUERY PLAN"] as PlanRoot[]|undefined;const root=payload?.[0];
  assert.ok(root?.Plan,`${label}: missing query plan`);
  const planning=Number(root?.["Planning Time"]??0);const execution=Number(root?.["Execution Time"]??0);const node=root?.Plan?.["Node Type"]??"unknown";
  console.log(`[db-perf] ${label}: planning ${planning.toFixed(3)} ms, execution ${execution.toFixed(3)} ms, root ${node}`);
  assert.ok(execution<1_000,`${label}: representative legacy fixture query exceeded 1s (${execution}ms)`);
}

dbTest("representative admin queries have bounded query plans",async(pool)=>{
  const project=await pool.query<{camp_id:number}>("SELECT camp_id FROM campaigns ORDER BY camp_id LIMIT 1");assert.equal(project.rowCount,1);const projectId=project.rows[0].camp_id;
  await explain(pool,"entity picker people",`SELECT n.n_id,n.name,c.race,l.name AS location_name FROM npcs n LEFT JOIN charakters c ON c.n_id=n.n_id LEFT JOIN locations l ON l.loc_id=c.loc_id AND l.camp_id=n.camp_id WHERE n.camp_id=$1 AND n.archived_at IS NULL ORDER BY n.name,n.n_id LIMIT 20`,[projectId]);
  await explain(pool,"groups paginated with one membership aggregate",`SELECT g.gr_id,g.name,COALESCE(ms.known_members,0)::int AS known_members FROM groups g LEFT JOIN LATERAL (SELECT count(*)::int AS known_members FROM group_memberships gm WHERE gm.project_id=g.camp_id AND gm.group_id=g.gr_id) ms ON true WHERE g.camp_id=$1 AND g.archived_at IS NULL ORDER BY g.name,g.gr_id LIMIT 25`,[projectId]);
  await explain(pool,"timeline world-day pagination",`SELECT e.e_id,e.name,e.world_day_start FROM events e WHERE e.camp_id=$1 AND e.archived_at IS NULL ORDER BY e.world_day_start NULLS LAST,e.sort_value NULLS LAST,e.e_id LIMIT 25`,[projectId]);
  const tree=await pool.query<{family_tree_id:number}>("SELECT family_tree_id FROM family_trees WHERE project_id=$1 ORDER BY family_tree_id LIMIT 1",[projectId]);
  if(tree.rowCount){await explain(pool,"named family tree scoped edges",`SELECT r.entity_a_id,r.entity_b_id FROM relationships r JOIN relationship_types rt ON rt.relationship_type_id=r.relationship_type_id JOIN family_tree_members ma ON ma.family_tree_id=$2 AND ma.person_id=r.entity_a_id JOIN family_tree_members mb ON mb.family_tree_id=$2 AND mb.person_id=r.entity_b_id WHERE r.project_id=$1 AND r.entity_a_type='person' AND r.entity_b_type='person' AND rt.category='family'`,[projectId,tree.rows[0].family_tree_id]);}
});
