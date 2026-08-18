import { Pool } from "pg";

type Finding={level:"ERROR"|"WARNING";code:string;count:number;detail?:string};

async function main(){
  const connectionString=process.env.DATABASE_URL;if(!connectionString)throw new Error("DATABASE_URL is required");
  const pool=new Pool({connectionString});
  const findings:Finding[]=[];
  async function scalar(sql:string,params:unknown[]=[]){const r=await pool.query<{value:string|number}>(sql,params);return Number(r.rows[0]?.value??0);}
  function error(code:string,count:number,detail?:string){if(count)findings.push({level:"ERROR",code,count,detail});}
  function warning(code:string,count:number,detail?:string){if(count)findings.push({level:"WARNING",code,count,detail});}

  try{
    await pool.query("BEGIN READ ONLY");
    const counts={
      campaigns:await scalar("SELECT count(*) value FROM campaigns"),npcs:await scalar("SELECT count(*) value FROM npcs"),charakters:await scalar("SELECT count(*) value FROM charakters"),gods:await scalar("SELECT count(*) value FROM gods"),chars:await scalar("SELECT count(*) value FROM chars"),users:await scalar("SELECT count(*) value FROM users"),locations:await scalar("SELECT count(*) value FROM locations"),groups:await scalar("SELECT count(*) value FROM groups"),is_part_of:await scalar("SELECT count(*) value FROM is_part_of"),events:await scalar("SELECT count(*) value FROM events"),parent_child_relationships:await scalar("SELECT count(*) value FROM parent_child_relationships"),romantic_relationships:await scalar("SELECT count(*) value FROM romantic_relationships"),
    };
    const person={total:await scalar("SELECT count(*) value FROM npcs"),characters:await scalar("SELECT count(*) value FROM npcs n WHERE EXISTS(SELECT 1 FROM charakters c WHERE c.n_id=n.n_id)"),gods:await scalar("SELECT count(*) value FROM npcs n WHERE EXISTS(SELECT 1 FROM gods g WHERE g.n_id=n.n_id)"),baseOnly:await scalar("SELECT count(*) value FROM npcs n WHERE NOT EXISTS(SELECT 1 FROM charakters c WHERE c.n_id=n.n_id) AND NOT EXISTS(SELECT 1 FROM gods g WHERE g.n_id=n.n_id)"),overlaps:await scalar("SELECT count(*) value FROM npcs n WHERE EXISTS(SELECT 1 FROM charakters c WHERE c.n_id=n.n_id) AND EXISTS(SELECT 1 FROM gods g WHERE g.n_id=n.n_id)"),duplicateCharacters:await scalar("SELECT count(*) value FROM (SELECT n_id FROM charakters GROUP BY n_id HAVING count(*)>1)x"),duplicateGods:await scalar("SELECT count(*) value FROM (SELECT n_id FROM gods GROUP BY n_id HAVING count(*)>1)x")};
    const idChecks={characterIdsDiffer:await scalar("SELECT count(*) value FROM charakters WHERE char_id<>n_id"),godIdsDiffer:await scalar("SELECT count(*) value FROM gods WHERE g_id<>n_id")};
    error("person.base_only",person.baseOnly);error("person.character_god_overlap",person.overlaps);error("person.duplicate_character_subtype",person.duplicateCharacters);error("person.duplicate_god_subtype",person.duplicateGods);
    error("person.partition_total_mismatch",person.characters+person.gods-person.total);
    error("group_membership.duplicate",await scalar("SELECT count(*) value FROM (SELECT project_id,group_id,entity_type,entity_id FROM group_memberships GROUP BY 1,2,3,4 HAVING count(*)>1)x"));
    error("group_membership.invalid_person",await scalar("SELECT count(*) value FROM group_memberships gm WHERE gm.entity_type='person' AND NOT EXISTS(SELECT 1 FROM npcs n WHERE n.n_id=gm.entity_id AND n.camp_id=gm.project_id)"));
    error("generic.legacy_person_types",await scalar(`SELECT (SELECT count(*) FROM relationships WHERE entity_a_type IN ('npc','character','god') OR entity_b_type IN ('npc','character','god'))+(SELECT count(*) FROM entity_visibility WHERE entity_type IN ('npc','character','god'))+(SELECT count(*) FROM player_entity_variants WHERE entity_type IN ('npc','character','god') AND entity_id IS NOT NULL)+(SELECT count(*) FROM entity_tags WHERE entity_type IN ('npc','character','god'))+(SELECT count(*) FROM timeline_links WHERE entity_type IN ('npc','character','god'))+(SELECT count(*) FROM map_markers WHERE entity_type IN ('npc','character','god'))+(SELECT count(*) FROM media WHERE entity_type IN ('npc','character','god'))+(SELECT count(*) FROM group_memberships WHERE entity_type IN ('npc','character','god')) value`));
    error("player_character.assigned_god",await scalar("SELECT count(*) value FROM chars a JOIN gods g ON g.n_id=a.n_id"));
    error("player_character.not_character",await scalar("SELECT count(*) value FROM chars a WHERE NOT EXISTS(SELECT 1 FROM charakters c WHERE c.n_id=a.n_id)"));
    error("parent.self",await scalar("SELECT count(*) value FROM parent_child_relationships WHERE parent_id=child_id"));
    error("romantic.self",await scalar("SELECT count(*) value FROM romantic_relationships WHERE partner1_id=partner2_id"));
    error("location.self_parent",await scalar("SELECT count(*) value FROM locations WHERE parent_loc_id=loc_id"));
    error("relationship.invalid_person_endpoint",await scalar("SELECT count(*) value FROM relationships r WHERE (r.entity_a_type='person' AND NOT EXISTS(SELECT 1 FROM npcs n WHERE n.n_id=r.entity_a_id AND n.camp_id=r.project_id)) OR (r.entity_b_type='person' AND NOT EXISTS(SELECT 1 FROM npcs n WHERE n.n_id=r.entity_b_id AND n.camp_id=r.project_id))"));
    warning("legacy.placeholder_birthday",await scalar("SELECT count(*) value FROM charakters WHERE birthday='2000-01-01'::date"));
    warning("legacy.trailing_whitespace_name",await scalar("SELECT count(*) value FROM npcs WHERE name<>btrim(name)"));
    warning("legacy.malformed_image_ref",await scalar("SELECT count(*) value FROM groups WHERE image IS NOT NULL AND image NOT IN ('noimage','/noimg.jpg') AND image !~ '^https?://' AND image !~ '^/(img|images)/'"));
    warning("group.estimated_vs_known_diff",await scalar("SELECT count(*) value FROM groups g WHERE g.members<>(SELECT count(*) FROM group_memberships gm WHERE gm.project_id=g.camp_id AND gm.group_id=g.gr_id)"),"Expected warning: estimated total and known memberships are different domain values.");
    warning("users.unassigned",await scalar("SELECT count(*) value FROM users u WHERE NOT EXISTS(SELECT 1 FROM chars a WHERE a.user_id=u.user_id)"));
    await pool.query("ROLLBACK");
    console.log(JSON.stringify({counts,person,idChecks,findings},null,2));
    if(findings.some(f=>f.level==="ERROR"))process.exitCode=1;
  }catch(error){try{await pool.query("ROLLBACK");}catch{}throw error;}finally{await pool.end();}
}

main().catch((error)=>{
  console.error(error instanceof Error?error.message:error);
  process.exitCode=1;
});
