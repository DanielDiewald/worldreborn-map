import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { FantasyDateInput } from "@/components/fantasy-date-input";
import { ImageSourceInput } from "@/components/image-source-input";
import { Pagination } from "@/components/pagination";
import { requireAdminSession } from "@/lib/auth/session";
import { calendarStatus, getProjectCalendar } from "@/lib/calendar";
import { listNpcsPaginated, type NpcListFilters } from "@/lib/entities/npcs";
import { listLocations } from "@/lib/entities/locations";
import { calculateFantasyAge, type FantasyDate } from "@/lib/fantasy-calendar";
import { parsePagination } from "@/lib/pagination";
import { getProject } from "@/lib/projects";
import { createNpcAction } from "./actions";

type Search = Promise<{ q?: string; visibility?: string; page?: string; pageSize?: string }>;
function visibilityLabel(mode:string){return mode==="all_players"?"Alle Spieler":mode==="selected_players"?"Ausgewählte":"Nur Admin";}
function birthDate(npc:{birthEra:"before"|"after"|null;birthYear:number|null;birthMonth:number|null;birthDay:number|null;birthPrecision:string|null}):FantasyDate|null{return npc.birthEra&&npc.birthYear!=null&&npc.birthPrecision?{era:npc.birthEra,year:npc.birthYear,month:npc.birthMonth,day:npc.birthDay,precision:npc.birthPrecision as FantasyDate["precision"]}:null;}

export default async function NpcListPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Search}){
  await requireAdminSession();
  const [{projectId:rawProjectId},search]=await Promise.all([params,searchParams]);
  const projectId=Number.parseInt(rawProjectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const [project,locations,calendar]=await Promise.all([getProject(projectId),listLocations(projectId),getProjectCalendar(projectId)]);if(!project)notFound();
  const visibility=["admin_only","all_players","selected_players"].includes(search.visibility??"")?search.visibility as NpcListFilters["visibility"]:undefined;
  const pagination=parsePagination(search);const result=await listNpcsPaginated(projectId,{query:search.q,visibility},pagination);const path=`/admin/projects/${projectId}/npcs`;const calendarReady=calendar?calendarStatus(calendar).ready:false;
  return <AdminShell projectId={projectId} projectName={project.name} section="npcs" eyebrow={`${project.name} / World`} title="NPCs">
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>NPCs</strong></div><h1>NPCs & Characters</h1><p>Race/Spezies kommt kanonisch aus <code>charakters.race</code>. Alter wird aus dem konfigurierten Fantasy-Geburtsdatum und dem aktuellen Weltdatum berechnet.</p></div>
      {locations.length?<details className="create-dropdown"><summary className="button primary">＋ Neuer NPC</summary><div className="create-popover" style={{minWidth:680}}><div className="popover-heading"><strong>NPC erstellen</strong><span>Person, Character-Subtype und Weltzeit bleiben getrennt.</span></div><form action={createNpcAction.bind(null,projectId)} className="stack">
        <section><span className="panel-kicker">GEMEINSAME PERSON · NPCS</span><div className="field-grid two"><label>Name<input name="name" maxLength={100} required/></label><label>Personen-Titel<input name="title" maxLength={120}/></label><label>Beruf / Profession<input name="profession" maxLength={120}/></label><label>Geschlecht<input name="gender" maxLength={10} placeholder="unknown"/></label></div><ImageSourceInput/></section>
        <section><span className="panel-kicker">CHARACTER SUBTYPE · CHARAKTERS</span><div className="field-grid two"><label>Ort<select name="locationId" required>{locations.map((l)=><option key={l.loc_id} value={l.loc_id}>{l.name}</option>)}</select></label><label>Race / Spezies<input name="race" maxLength={80} required/></label><label>Klasse<input name="className" maxLength={50}/></label><label><input name="alive" type="checkbox" defaultChecked/> Lebendig</label><label><input name="follower" type="checkbox"/> Follower</label></div></section>
        {calendar&&calendarReady?<section><span className="panel-kicker">WELTZEIT</span><FantasyDateInput prefix="birth" label="Geburtsdatum" months={calendar.months} beforeEraLabel={calendar.beforeEraLabel} afterEraLabel={calendar.afterEraLabel} hasYearZero={calendar.hasYearZero}/></section>:<div className="notice warning">Geburtsdatum kann nach dem Anlegen gepflegt werden, sobald der <Link href={`/admin/projects/${projectId}/settings/calendar`}>Weltkalender</Link> gültig konfiguriert ist.</div>}
        <section><span className="panel-kicker">BESCHREIBUNG & WISSEN · NPCS</span><label>Öffentliche Beschreibung<textarea name="publicDescription" maxLength={100000}/></label><label>Admin-Notizen<textarea name="adminNotes" maxLength={100000}/></label></section><button className="primary" type="submit">NPC anlegen</button>
      </form></div></details>:<span className="muted">Zum Anlegen wird zuerst eine Location benötigt.</span>}
    </div>
    <section className="panel-card npc-browser"><form className="filter-bar" method="get"><label className="search-box"><span aria-hidden="true">⌕</span><input name="q" defaultValue={search.q??""} placeholder="NPC, Race, Klasse oder Beruf suchen …"/></label><select name="visibility" defaultValue={visibility??""}><option value="">Alle Sichtbarkeiten</option><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select><button type="submit">Filtern</button></form>
      <div className="table-meta"><span><strong>{result.total}</strong> NPCs / Characters</span><span>Kanonische Personen-ID: n_id</span></div>
      {result.items.length===0?<div className="empty-state large"><strong>Keine NPCs gefunden</strong></div>:<div className="table-scroll"><table className="entity-table"><thead><tr><th>Person</th><th>Character</th><th>Ort</th><th>Profession</th><th>Sichtbarkeit</th><th/></tr></thead><tbody>{result.items.map((npc)=>{const age=calendar&&calendarReady?calculateFantasyAge(birthDate(npc),calendar):null;const ageText=age?.label||(npc.age>0?`${npc.age} Jahre (Legacy)`:"Alter unbekannt");return <tr key={npc.nId}><td><Link className="entity-cell" href={`/admin/projects/${projectId}/npcs/${npc.nId}`}><span className="entity-avatar">{npc.image&&npc.image!=="noimage"?<img src={npc.image} alt=""/>:npc.name.slice(0,1).toUpperCase()}</span><span><strong>{npc.name}</strong><small>{npc.title||`Person #${npc.nId}`}</small></span></Link></td><td><strong>{npc.race||"—"}</strong><br/><small className="muted">{npc.className||"—"} · {ageText}</small></td><td>{npc.location}</td><td>{npc.profession||"—"}</td><td><span className={`visibility-pill ${npc.visibilityMode}`}>{visibilityLabel(npc.visibilityMode)}</span></td><td><Link className="table-action" href={`/admin/projects/${projectId}/npcs/${npc.nId}`}>→</Link></td></tr>;})}</tbody></table></div>}
      <Pagination pathname={path} searchParams={{q:search.q,visibility:search.visibility}} page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages}/>
    </section>
  </AdminShell>;
}
