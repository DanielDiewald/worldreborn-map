import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

const databaseUrl=process.env.DATABASE_URL;
const dbTest=(name:string,fn:(pool:Pool)=>Promise<void>)=>test(name,{skip:!databaseUrl},async()=>{const pool=new Pool({connectionString:databaseUrl});try{await fn(pool);}finally{await pool.end();}});
async function count(pool:Pool,sql:string,params:unknown[]=[]){const result=await pool.query<{value:number|string}>(sql,params);return Number(result.rows[0]?.value??0);}

dbTest("0006 fantasy calendar schema is additive and inventories legacy character chronology",async(pool)=>{
  assert.equal(await count(pool,"SELECT count(*) value FROM calendar_migration_audit"),114);
  assert.equal(await count(pool,"SELECT count(*) value FROM project_calendars"),0);
  assert.equal(await count(pool,"SELECT count(*) value FROM information_schema.columns WHERE table_schema='public' AND table_name='charakters' AND column_name IN ('age','birthday','race')"),3);
  assert.equal(await count(pool,"SELECT count(*) value FROM information_schema.columns WHERE table_schema='public' AND table_name='npcs' AND column_name='species'"),1);
  assert.equal(await count(pool,"SELECT count(*) value FROM information_schema.columns WHERE table_schema='public' AND table_name='events' AND column_name IN ('calendar_id','date_precision','world_day_start','world_day_end','image_media_id')"),5);
  assert.equal(await count(pool,"SELECT count(*) value FROM information_schema.columns WHERE table_schema='public' AND table_name='groups' AND column_name='image_media_id'"),1);
});

dbTest("approximate fantasy birth migration can preserve legacy age and birthday without inventing month or day",async(pool)=>{
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const candidate=await client.query<{project_id:number;person_id:number;age:number;birthday:string}>(`SELECT n.camp_id AS project_id,n.n_id AS person_id,c.age,c.birthday::text FROM npcs n JOIN charakters c ON c.n_id=n.n_id WHERE n.archived_at IS NULL ORDER BY n.n_id LIMIT 1`);
    assert.equal(candidate.rowCount,1);const person=candidate.rows[0];
    const calendar=await client.query<{calendar_id:string}>(`INSERT INTO project_calendars(project_id,name,days_per_year,has_year_zero,before_era_label,after_era_label,current_era,current_year,current_month,current_day,current_world_day,is_active) VALUES($1,'Integration Calendar',100,false,'v.I.','n.I.','after',50,2,1,4930,true) RETURNING calendar_id`,[person.project_id]);
    const calendarId=Number(calendar.rows[0].calendar_id);
    await client.query(`INSERT INTO calendar_months(calendar_id,sort_order,name,days) VALUES($1,1,'Frost',40),($1,2,'Glut',60)`,[calendarId]);
    const inserted=await client.query<{fantasy_date_id:string}>(`INSERT INTO fantasy_dates(project_id,calendar_id,entity_type,entity_id,field_key,era,year,month,day,precision,ordinal_start,ordinal_end,source,metadata) VALUES($1,$2,'person',$3,'birth','after',40,NULL,NULL,'approximate_year',3900,3999,'estimated_from_age',$4::jsonb) RETURNING fantasy_date_id`,[person.project_id,calendarId,person.person_id,JSON.stringify({legacy_age:person.age})]);
    await client.query(`UPDATE calendar_migration_audit SET new_fantasy_date_id=$3,migration_method='estimated_from_age',status='migrated' WHERE project_id=$1 AND person_id=$2`,[person.project_id,person.person_id,Number(inserted.rows[0].fantasy_date_id)]);
    const fantasy=await client.query<{month:number|null;day:number|null;precision:string;source:string}>("SELECT month,day,precision,source FROM fantasy_dates WHERE fantasy_date_id=$1",[inserted.rows[0].fantasy_date_id]);
    assert.equal(fantasy.rows[0].precision,"approximate_year");assert.equal(fantasy.rows[0].month,null);assert.equal(fantasy.rows[0].day,null);assert.equal(fantasy.rows[0].source,"estimated_from_age");
    const legacy=await client.query<{age:number;birthday:string}>("SELECT age,birthday::text FROM charakters WHERE n_id=$1",[person.person_id]);
    assert.equal(legacy.rows[0].age,person.age);assert.equal(legacy.rows[0].birthday,person.birthday);
    await client.query("ROLLBACK");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});

dbTest("calendar migration audit never silently resolves differing race and species values",async(pool)=>{
  const conflicts=await count(pool,`SELECT count(*) value FROM calendar_migration_audit WHERE COALESCE((detail->>'species_race_conflict')::boolean,false)`);
  const actual=await count(pool,`SELECT count(*) value FROM npcs n JOIN charakters c ON c.n_id=n.n_id WHERE NULLIF(BTRIM(COALESCE(n.species,'')),'') IS NOT NULL AND NULLIF(BTRIM(COALESCE(c.race,'')),'') IS NOT NULL AND LOWER(BTRIM(n.species))<>LOWER(BTRIM(c.race))`);
  assert.equal(conflicts,actual);
});
