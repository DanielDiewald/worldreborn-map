import "server-only";

import { z } from "zod";
import { pool } from "@/lib/db";
import { clampPagination, paginatedResult, type Pagination } from "@/lib/pagination";

const treeSchema=z.object({name:z.string().trim().max(160).optional(),subtitle:z.string().trim().max(240).optional(),description:z.string().max(100000).optional(),rootPersonId:z.coerce.number().int().positive().optional(),visibilityMode:z.enum(["admin_only","all_players","selected_players"]).default("admin_only")});

export type FamilyTreeNode={personId:number;name:string;image:string;kind:"God"|"Player Character"|"NPC / Character";title:string|null;roleLabel:string|null;branchLabel:string|null};
export type FamilyTreeEdge={a:number;b:number;code:string;label:string;inverseLabel:string|null;directed:boolean;source:string};
type FamilyTreeMetadata={main_line_person_ids?:unknown};
type FamilyTreeRecord={tree_id:number|null;name:string|null;subtitle:string|null;description:string|null;root_person_id:number|null;visibility_mode:string;metadata:FamilyTreeMetadata};

function parseMainLinePersonIds(metadata:FamilyTreeMetadata|unknown){
  if(!metadata||typeof metadata!=="object")return [];
  const raw=(metadata as FamilyTreeMetadata).main_line_person_ids;
  if(!Array.isArray(raw))return [];
  return [...new Set(raw.map((value)=>Number(value)).filter((value)=>Number.isSafeInteger(value)&&value>0))];
}

export async function listFamilyTreePeople(projectId:number){const r=await pool.query<{person_id:number;name:string;image:string;kind:string}>(`SELECT n.n_id AS person_id,n.name,n.image,CASE WHEN g.g_id IS NOT NULL THEN 'God' WHEN EXISTS(SELECT 1 FROM chars ch WHERE ch.n_id=n.n_id) THEN 'Player Character' ELSE 'NPC / Character' END AS kind FROM npcs n LEFT JOIN gods g ON g.n_id=n.n_id WHERE n.camp_id=$1 AND n.archived_at IS NULL ORDER BY n.name,n.n_id`,[projectId]);return r.rows;}

export async function listFamilyTreesPaginated(projectId:number,pagination:Pagination){
  const count=await pool.query<{total:number}>("SELECT count(*)::int AS total FROM family_trees WHERE project_id=$1",[projectId]);
  const total=count.rows[0]?.total??0;const page=clampPagination(total,pagination);
  const rows=await pool.query<{tree_id:number;name:string|null;subtitle:string|null;description:string|null;root_person_id:number|null;root_name:string|null;visibility_mode:string;member_count:number}>(`SELECT ft.family_tree_id AS tree_id,ft.name,ft.subtitle,ft.description,ft.root_person_id,n.name AS root_name,ft.visibility_mode,(SELECT count(*)::int FROM family_tree_members m WHERE m.family_tree_id=ft.family_tree_id) AS member_count FROM family_trees ft LEFT JOIN npcs n ON n.n_id=ft.root_person_id AND n.camp_id=ft.project_id WHERE ft.project_id=$1 ORDER BY COALESCE(ft.name,''),ft.family_tree_id LIMIT $2 OFFSET $3`,[projectId,page.limit,page.offset]);
  return paginatedResult(rows.rows,total,page);
}

async function assertPerson(projectId:number,personId:number){const r=await pool.query("SELECT 1 FROM npcs WHERE camp_id=$1 AND n_id=$2 AND archived_at IS NULL",[projectId,personId]);if(r.rowCount!==1)throw new Error("Person does not belong to this project.");}

export async function createFamilyTree(projectId:number,input:unknown){const d=treeSchema.parse(input);if(d.rootPersonId)await assertPerson(projectId,d.rootPersonId);const client=await pool.connect();try{await client.query("BEGIN");const r=await client.query<{tree_id:number}>(`INSERT INTO family_trees(project_id,name,subtitle,description,root_person_id,visibility_mode) VALUES($1,$2,$3,$4,$5,$6) RETURNING family_tree_id AS tree_id`,[projectId,d.name||null,d.subtitle||null,d.description||null,d.rootPersonId||null,d.visibilityMode]);const treeId=r.rows[0].tree_id;if(d.rootPersonId){await client.query("INSERT INTO family_tree_members(family_tree_id,person_id,role_label) VALUES($1,$2,'Root') ON CONFLICT(family_tree_id,person_id) DO NOTHING",[treeId,d.rootPersonId]);}await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','family_tree.created','family_tree',$2,$3::jsonb)`,[projectId,treeId,JSON.stringify({root_person_id:d.rootPersonId??null})]);await client.query("COMMIT");if(d.rootPersonId)await refreshFamilyTreeMembers(projectId,treeId);return treeId;}catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}}

export async function addFamilyTreeMember(projectId:number,treeId:number,personId:number,roleLabel?:string,branchLabel?:string){await assertPerson(projectId,personId);const r=await pool.query(`INSERT INTO family_tree_members(family_tree_id,person_id,role_label,branch_label) SELECT ft.family_tree_id,$3,$4,$5 FROM family_trees ft WHERE ft.project_id=$1 AND ft.family_tree_id=$2 ON CONFLICT(family_tree_id,person_id) DO UPDATE SET role_label=COALESCE(EXCLUDED.role_label,family_tree_members.role_label),branch_label=COALESCE(EXCLUDED.branch_label,family_tree_members.branch_label),updated_at=now()`,[projectId,treeId,personId,roleLabel||null,branchLabel||null]);if(r.rowCount!==1)throw new Error("Family tree not found in this project.");}

export async function removeFamilyTreeMember(projectId:number,treeId:number,personId:number){await pool.query("DELETE FROM family_tree_members m USING family_trees ft WHERE m.family_tree_id=ft.family_tree_id AND ft.project_id=$1 AND ft.family_tree_id=$2 AND m.person_id=$3 AND COALESCE(ft.root_person_id,0)<>$3",[projectId,treeId,personId]);}

export async function updateFamilyTreeMainLine(projectId:number,treeId:number,personIds:number[]){
  const ids=[...new Set(personIds)].filter((value)=>Number.isSafeInteger(value)&&value>0);
  if(ids.length!==personIds.length)throw new Error("Die Hauptlinie enthält ungültige oder doppelte Personen.");
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const tree=await client.query("SELECT 1 FROM family_trees WHERE project_id=$1 AND family_tree_id=$2 FOR UPDATE",[projectId,treeId]);
    if(tree.rowCount!==1)throw new Error("Family tree not found in this project.");
    if(ids.length){
      const members=await client.query<{person_id:number}>("SELECT person_id FROM family_tree_members WHERE family_tree_id=$1 AND person_id=ANY($2::int[])",[treeId,ids]);
      if(members.rowCount!==ids.length)throw new Error("Jede Person der Hauptlinie muss Mitglied dieses Stammbaums sein.");
      for(let index=1;index<ids.length;index+=1){
        const parentId=ids[index-1],childId=ids[index];
        const relation=await client.query<{valid:boolean}>(`SELECT EXISTS(
          SELECT 1 FROM relationships r JOIN relationship_types rt ON rt.relationship_type_id=r.relationship_type_id
          WHERE r.project_id=$1 AND r.entity_a_type='person' AND r.entity_b_type='person' AND r.entity_a_id=$2 AND r.entity_b_id=$3
            AND rt.code IN ('parent','adoptive_parent','step_parent','guardian')
          UNION ALL
          SELECT 1 FROM parent_child_relationships p JOIN npcs pa ON pa.n_id=p.parent_id JOIN npcs ch ON ch.n_id=p.child_id
          WHERE pa.camp_id=$1 AND ch.camp_id=$1 AND p.parent_id=$2 AND p.child_id=$3
        ) AS valid`,[projectId,parentId,childId]);
        if(!relation.rows[0]?.valid)throw new Error("Die Hauptlinie muss einer direkten Eltern-Kind-Kette folgen.");
      }
      await client.query("UPDATE family_trees SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{main_line_person_ids}',$3::jsonb,true),updated_at=now() WHERE project_id=$1 AND family_tree_id=$2",[projectId,treeId,JSON.stringify(ids)]);
    }else{
      await client.query("UPDATE family_trees SET metadata=COALESCE(metadata,'{}'::jsonb)-'main_line_person_ids',updated_at=now() WHERE project_id=$1 AND family_tree_id=$2",[projectId,treeId]);
    }
    await client.query(`INSERT INTO audit_log(project_id,actor_type,action,entity_type,entity_id,metadata) VALUES($1,'admin','family_tree.main_line_updated','family_tree',$2,$3::jsonb)`,[projectId,treeId,JSON.stringify({person_ids:ids,mode:ids.length?"manual":"automatic"})]);
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function refreshFamilyTreeMembers(projectId:number,treeId:number){
  const tree=await pool.query<{root_person_id:number|null}>("SELECT root_person_id FROM family_trees WHERE project_id=$1 AND family_tree_id=$2",[projectId,treeId]);if(tree.rowCount!==1)throw new Error("Family tree not found in this project.");const root=tree.rows[0].root_person_id;if(!root)return 0;
  const r=await pool.query(`WITH RECURSIVE family_links(a,b) AS (
    SELECT r.entity_a_id::int,r.entity_b_id::int FROM relationships r JOIN relationship_types rt ON rt.relationship_type_id=r.relationship_type_id WHERE r.project_id=$1 AND r.entity_a_type='person' AND r.entity_b_type='person' AND rt.category='family'
    UNION
    SELECT p.parent_id,p.child_id FROM parent_child_relationships p JOIN npcs pa ON pa.n_id=p.parent_id JOIN npcs ch ON ch.n_id=p.child_id WHERE pa.camp_id=$1 AND ch.camp_id=$1
  ), connected(person_id) AS (
    SELECT $3::int
    UNION
    SELECT CASE WHEN l.a=c.person_id THEN l.b ELSE l.a END FROM connected c JOIN family_links l ON l.a=c.person_id OR l.b=c.person_id
  )
  INSERT INTO family_tree_members(family_tree_id,person_id)
  SELECT $2,c.person_id FROM connected c JOIN npcs n ON n.n_id=c.person_id AND n.camp_id=$1 AND n.archived_at IS NULL
  ON CONFLICT(family_tree_id,person_id) DO NOTHING`,[projectId,treeId,root]);return r.rowCount??0;
}

export async function getFamilyTreeGraph(projectId:number,treeRef:number|"all"){
  const tree:FamilyTreeRecord|null=treeRef==="all"?{tree_id:null,name:"Gesamter Familiengraph",subtitle:"Alle Familienbeziehungen des Projekts",description:null,root_person_id:null,visibility_mode:"admin_only",metadata:{}}:((await pool.query<FamilyTreeRecord>("SELECT family_tree_id AS tree_id,name,subtitle,description,root_person_id,visibility_mode,metadata FROM family_trees WHERE project_id=$1 AND family_tree_id=$2",[projectId,treeRef])).rows[0]??null);
  if(!tree)return null;
  const named=treeRef!=="all";
  const peopleSql=named?`SELECT n.n_id AS "personId",n.name,n.image,CASE WHEN g.g_id IS NOT NULL THEN 'God' WHEN EXISTS(SELECT 1 FROM chars ch WHERE ch.n_id=n.n_id) THEN 'Player Character' ELSE 'NPC / Character' END AS kind,n.title,m.role_label AS "roleLabel",m.branch_label AS "branchLabel" FROM family_tree_members m JOIN family_trees ft ON ft.family_tree_id=m.family_tree_id JOIN npcs n ON n.n_id=m.person_id AND n.camp_id=ft.project_id LEFT JOIN gods g ON g.n_id=n.n_id WHERE ft.project_id=$1 AND m.family_tree_id=$2 AND n.archived_at IS NULL ORDER BY m.sort_order,n.name,n.n_id`:`SELECT n.n_id AS "personId",n.name,n.image,CASE WHEN g.g_id IS NOT NULL THEN 'God' WHEN EXISTS(SELECT 1 FROM chars ch WHERE ch.n_id=n.n_id) THEN 'Player Character' ELSE 'NPC / Character' END AS kind,n.title,NULL::varchar AS "roleLabel",NULL::varchar AS "branchLabel" FROM npcs n LEFT JOIN gods g ON g.n_id=n.n_id WHERE n.camp_id=$1 AND n.archived_at IS NULL ORDER BY n.name,n.n_id`;
  const people=(await pool.query<FamilyTreeNode>(peopleSql,named?[projectId,treeRef]:[projectId])).rows;
  const memberIds=new Set(people.map((p)=>p.personId));
  const relationshipEdges=await pool.query<FamilyTreeEdge>(`SELECT r.entity_a_id::int AS a,r.entity_b_id::int AS b,rt.code,rt.label,rt.inverse_label AS "inverseLabel",rt.directed,'relationship'::text AS source FROM relationships r JOIN relationship_types rt ON rt.relationship_type_id=r.relationship_type_id WHERE r.project_id=$1 AND r.entity_a_type='person' AND r.entity_b_type='person' AND rt.category='family' ORDER BY r.relationship_id`,[projectId]);
  const legacyEdges=await pool.query<FamilyTreeEdge>(`SELECT p.parent_id AS a,p.child_id AS b,'parent'::text AS code,'Parent'::text AS label,'Child'::text AS "inverseLabel",true AS directed,'legacy_parent_child'::text AS source FROM parent_child_relationships p JOIN npcs pa ON pa.n_id=p.parent_id JOIN npcs ch ON ch.n_id=p.child_id WHERE pa.camp_id=$1 AND ch.camp_id=$1`,[projectId]);
  const seen=new Set<string>();const edges:FamilyTreeEdge[]=[];for(const edge of [...relationshipEdges.rows,...legacyEdges.rows]){if(!memberIds.has(edge.a)||!memberIds.has(edge.b))continue;const symmetric=!edge.directed;const key=symmetric?[edge.code,Math.min(edge.a,edge.b),Math.max(edge.a,edge.b)].join(":"):[edge.code,edge.a,edge.b].join(":");if(seen.has(key))continue;seen.add(key);edges.push(edge);}
  return{tree,people,edges,mainLinePersonIds:parseMainLinePersonIds(tree.metadata)};
}
