import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { EntityImageFrame } from "@/components/entity-image-frame";
import { EntityPicker } from "@/components/entity-picker";
import { Pagination } from "@/components/pagination";
import { requireAdminSession } from "@/lib/auth/session";
import { calendarStatus, getProjectCalendar } from "@/lib/calendar";
import { listNpcFilterOptions, listNpcsPaginated, type NpcFilterOptions, type NpcListFilters } from "@/lib/entities/npcs";
import { getProjectEntityOption } from "@/lib/entity-search";
import { calculateFantasyAge, type FantasyDate } from "@/lib/fantasy-calendar";
import { parsePagination } from "@/lib/pagination";
import { PERSON_GENDER_OPTIONS, isPersonGender, personGenderLabel } from "@/lib/person-gender";
import { getProject } from "@/lib/projects";
import { NpcCreateDialog } from "./npc-create-dialog";

type Search = Promise<{q?: string;visibility?: string;alive?: string;follower?: string;gender?: string;locationId?: string;raceId?: string;className?: string;page?: string;pageSize?: string}>;
function visibilityLabel(mode:string){return mode==="all_players"?"Alle Spieler":mode==="selected_players"?"Ausgewählte":"Nur Admin";}
function chronologyDate(npc:{[key:string]:unknown},prefix:"birth"|"death"):FantasyDate|null{const era=npc[`${prefix}Era`];const year=npc[`${prefix}Year`];const month=npc[`${prefix}Month`];const day=npc[`${prefix}Day`];const precision=npc[`${prefix}Precision`];return (era==="before"||era==="after")&&typeof year==="number"&&typeof precision==="string"?{era,year,month:typeof month==="number"?month:null,day:typeof day==="number"?day:null,precision:precision as FantasyDate["precision"]}:null;}
function booleanFilter(value:string|undefined){return value==="true"?true:value==="false"?false:undefined;}
function raceOptionLabel(race:NpcFilterOptions["races"][number]){return race.parentName?`${race.parentName} → ${race.name}`:race.name;}

export default async function NpcListPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Search}){
  await requireAdminSession();
  const [{projectId:rawProjectId},search]=await Promise.all([params,searchParams]);
  const projectId=Number.parseInt(rawProjectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const visibility=["admin_only","all_players","selected_players"].includes(search.visibility??"")?search.visibility as NpcListFilters["visibility"]:undefined;
  const alive=booleanFilter(search.alive);const follower=booleanFilter(search.follower);
  const parsedLocationId=Number.parseInt(search.locationId??"",10);const locationId=Number.isSafeInteger(parsedLocationId)&&parsedLocationId>0?parsedLocationId:undefined;
  const parsedRaceId=Number.parseInt(search.raceId??"",10);const raceId=Number.isSafeInteger(parsedRaceId)&&parsedRaceId>0?parsedRaceId:undefined;
  const gender=isPersonGender(search.gender)?search.gender:undefined;const className=search.className?.trim()||undefined;
  const filters:NpcListFilters={query:search.q,visibility,alive,follower,gender,locationId,raceId,className};
  const pagination=parsePagination(search);
  const locationPromise=locationId?getProjectEntityOption(projectId,"location",locationId):Promise.resolve(null);
  const [project,calendar,filterOptions,locationOption,result]=await Promise.all([getProject(projectId),getProjectCalendar(projectId),listNpcFilterOptions(projectId),locationPromise,listNpcsPaginated(projectId,filters,pagination)]);
  if(!project)notFound();
  const path=`/admin/projects/${projectId}/npcs`;const calendarReady=calendar?calendarStatus(calendar).ready:false;
  const hasFilters=Boolean(search.q||search.visibility||search.alive||search.follower||search.gender||search.locationId||search.raceId||search.className);
  return <AdminShell projectId={projectId} projectName={project.name} section="npcs" eyebrow={`${project.name} / Welt`} title="NPCs">
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>NPCs</strong></div><h1>NPCs & Charaktere</h1><p>Spezies können in Subspezies unterteilt werden. Geschlecht und Spezies dürfen beide ausdrücklich „Unbekannt“ sein, wenn die Information in der Welt noch nicht feststeht.</p></div><div className="row wrap-row"><Link className="button ghost" href={`/admin/projects/${projectId}/races`}>Spezies verwalten</Link><NpcCreateDialog projectId={projectId} races={filterOptions.races}/></div></div>
    <section className="panel-card npc-browser"><form className="stack" method="get"><div className="filter-bar"><label className="search-box"><span aria-hidden="true">⌕</span><input name="q" defaultValue={search.q??""} placeholder="NPC, Spezies, Subspezies, Klasse oder Beruf suchen …" aria-label="NPCs durchsuchen"/></label><select name="alive" defaultValue={search.alive??""} aria-label="Lebensstatus"><option value="">Lebendig & verstorben</option><option value="true">Nur lebendig</option><option value="false">Nur verstorben</option></select><select name="gender" defaultValue={gender??""} aria-label="Geschlecht"><option value="">Alle Geschlechter</option>{PERSON_GENDER_OPTIONS.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}</select><select name="raceId" defaultValue={raceId??""} aria-label="Spezies"><option value="">Alle Spezies</option>{filterOptions.races.map((race)=><option key={race.id} value={race.id}>{raceOptionLabel(race)}</option>)}</select><select name="className" defaultValue={className??""} aria-label="Klasse"><option value="">Alle Klassen</option>{filterOptions.classes.map((value)=><option key={value} value={value}>{value}</option>)}</select><select name="follower" defaultValue={search.follower??""} aria-label="Follower-Status"><option value="">Follower & Nicht-Follower</option><option value="true">Nur Follower</option><option value="false">Keine Follower</option></select><select name="visibility" defaultValue={visibility??""} aria-label="Sichtbarkeit"><option value="">Alle Sichtbarkeiten</option><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte Spieler</option></select></div><div className="field-grid two"><EntityPicker projectId={projectId} name="locationId" types={["location"]} label="Ort" placeholder="Ort filtern …" initialValue={locationId?String(locationId):""} initialLabel={locationOption?.name??""} initialKind={locationOption?.kind??""} hint="Optional · serverseitige Suche."/><div className="row wrap-row" style={{alignItems:"end"}}><button type="submit">Filter anwenden</button>{hasFilters?<Link className="button ghost" href={path}>Alle Filter zurücksetzen</Link>:null}</div></div></form>
      <div className="table-meta"><span><strong>{result.total}</strong> NPCs / Charaktere</span><span>{hasFilters?"Mehrere Filter werden gleichzeitig angewendet":"Listenbilder werden als kleine Avatar-Derivate geladen"}</span></div>
      {result.items.length===0?<div className="empty-state large"><strong>Keine NPCs gefunden</strong><span>{hasFilters?"Filter ändern oder zurücksetzen.":"Lege den ersten NPC an."}</span></div>:<div className="table-scroll"><table className="entity-table"><thead><tr><th>Person</th><th>Charakter</th><th>Status</th><th>Ort</th><th>Profession</th><th>Sichtbarkeit</th><th/></tr></thead><tbody>{result.items.map((npc)=>{const birth=chronologyDate(npc,"birth");const death=!npc.alive?chronologyDate(npc,"death"):null;const age=calendar&&calendarReady?calculateFantasyAge(birth,calendar,death??undefined):null;const ageText=age?.label||(npc.age>0?`${npc.age} Jahre (Legacy)`:"Alter unbekannt");const racePath=npc.raceParentName?`${npc.raceParentName} → ${npc.raceBaseName}`:npc.raceBaseName;return <tr key={npc.nId}><td><Link className="entity-cell" href={`/admin/projects/${projectId}/npcs/${npc.nId}`}><EntityImageFrame className="entity-avatar" mode="thumbnail" src={npc.image} fallback={npc.name.slice(0,1).toUpperCase()} alt={`${npc.name} – Porträt`}/><span><strong>{npc.name}</strong><small>{[personGenderLabel(npc.gender),npc.title||`Person #${npc.nId}`].filter(Boolean).join(" · ")}</small></span></Link></td><td><strong>{npc.race||"—"}</strong><br/><small className="muted">{racePath} · {npc.className||"—"} · {ageText}</small></td><td><strong>{npc.alive?"Lebendig":"Verstorben"}</strong>{npc.follower?<><br/><small className="muted">Follower</small></>:null}</td><td>{npc.location}</td><td>{npc.profession||"—"}</td><td><span className={`visibility-pill ${npc.visibilityMode}`}>{visibilityLabel(npc.visibilityMode)}</span></td><td><Link className="table-action" aria-label={`${npc.name} öffnen`} href={`/admin/projects/${projectId}/npcs/${npc.nId}`}>→</Link></td></tr>;})}</tbody></table></div>}
      <Pagination pathname={path} searchParams={{q:search.q,visibility:search.visibility,alive:search.alive,follower:search.follower,gender:search.gender,locationId:search.locationId,raceId:search.raceId,className:search.className}} page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages}/>
    </section>
  </AdminShell>;
}
