import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { CharacterLifeStatusInput } from "@/components/character-life-status-input";
import { EntityPicker } from "@/components/entity-picker";
import { FantasyDateInput } from "@/components/fantasy-date-input";
import { ImageSourceInput } from "@/components/image-source-input";
import { Pagination } from "@/components/pagination";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminSession } from "@/lib/auth/session";
import { calendarStatus, getProjectCalendar } from "@/lib/calendar";
import { listNpcFilterOptions, listNpcsPaginated, type NpcListFilters } from "@/lib/entities/npcs";
import { getProjectEntityOption } from "@/lib/entity-search";
import { calculateFantasyAge, type FantasyDate } from "@/lib/fantasy-calendar";
import { parsePagination } from "@/lib/pagination";
import { getProject } from "@/lib/projects";
import { createNpcAction } from "./actions";

type Search = Promise<{
  q?: string;
  visibility?: string;
  alive?: string;
  follower?: string;
  gender?: string;
  locationId?: string;
  race?: string;
  className?: string;
  page?: string;
  pageSize?: string;
}>;
function visibilityLabel(mode:string){return mode==="all_players"?"Alle Spieler":mode==="selected_players"?"Ausgewählte":"Nur Admin";}
function birthDate(npc:{birthEra:"before"|"after"|null;birthYear:number|null;birthMonth:number|null;birthDay:number|null;birthPrecision:string|null}):FantasyDate|null{return npc.birthEra&&npc.birthYear!=null&&npc.birthPrecision?{era:npc.birthEra,year:npc.birthYear,month:npc.birthMonth,day:npc.birthDay,precision:npc.birthPrecision as FantasyDate["precision"]}:null;}
function booleanFilter(value:string|undefined){return value==="true"?true:value==="false"?false:undefined;}

export default async function NpcListPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Search}){
  await requireAdminSession();
  const [{projectId:rawProjectId},search]=await Promise.all([params,searchParams]);
  const projectId=Number.parseInt(rawProjectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const visibility=["admin_only","all_players","selected_players"].includes(search.visibility??"")?search.visibility as NpcListFilters["visibility"]:undefined;
  const alive=booleanFilter(search.alive);const follower=booleanFilter(search.follower);
  const parsedLocationId=Number.parseInt(search.locationId??"",10);const locationId=Number.isSafeInteger(parsedLocationId)&&parsedLocationId>0?parsedLocationId:undefined;
  const gender=search.gender?.trim()||undefined;const race=search.race?.trim()||undefined;const className=search.className?.trim()||undefined;
  const filters:NpcListFilters={query:search.q,visibility,alive,follower,gender,locationId,race,className};
  const pagination=parsePagination(search);
  const locationPromise=locationId?getProjectEntityOption(projectId,"location",locationId):Promise.resolve(null);
  const [project,calendar,filterOptions,locationOption,result]=await Promise.all([
    getProject(projectId),
    getProjectCalendar(projectId),
    listNpcFilterOptions(projectId),
    locationPromise,
    listNpcsPaginated(projectId,filters,pagination),
  ]);
  if(!project)notFound();
  const path=`/admin/projects/${projectId}/npcs`;const calendarReady=calendar?calendarStatus(calendar).ready:false;
  const hasFilters=Boolean(search.q||search.visibility||search.alive||search.follower||search.gender||search.locationId||search.race||search.className);
  return <AdminShell projectId={projectId} projectName={project.name} section="npcs" eyebrow={`${project.name} / World`} title="NPCs">
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>NPCs</strong></div><h1>NPCs & Characters</h1><p>Race/Spezies kommt kanonisch aus <code>charakters.race</code>. Alter wird aus dem konfigurierten Fantasy-Geburtsdatum und bei Verstorbenen bis zum Todesdatum berechnet.</p></div>
      <details className="create-dropdown"><summary className="button primary">＋ Neuer NPC</summary><div className="create-popover" style={{minWidth:680}}><div className="popover-heading"><strong>NPC erstellen</strong><span>Person, Character-Subtype und Weltzeit bleiben getrennt.</span></div><form action={createNpcAction.bind(null,projectId)} className="stack">
        <section><span className="panel-kicker">GEMEINSAME PERSON · NPCS</span><div className="field-grid two"><label>Name<input name="name" maxLength={100} required/></label><label>Personen-Titel<input name="title" maxLength={120}/></label><label>Beruf / Profession<input name="profession" maxLength={120}/></label><label>Geschlecht<input name="gender" maxLength={10} placeholder="unknown"/></label></div><ImageSourceInput/></section>
        <section><span className="panel-kicker">CHARACTER SUBTYPE · CHARAKTERS</span><div className="field-grid two"><EntityPicker projectId={projectId} name="locationId" types={["location"]} label="Ort" placeholder="Location suchen …" required allowClear={false} hint="Serverseitige Suche; es werden nie alle Orte in den Browser geladen."/><label>Race / Spezies<input name="race" maxLength={80} required/></label><label>Klasse<input name="className" maxLength={50}/></label><label><input name="follower" type="checkbox"/> Follower</label></div></section>
        <section><span className="panel-kicker">WELTZEIT & LEBENSSTATUS</span>{calendar&&calendarReady?<FantasyDateInput prefix="birth" label="Geburtsdatum" months={calendar.months} beforeEraLabel={calendar.beforeEraLabel} afterEraLabel={calendar.afterEraLabel} hasYearZero={calendar.hasYearZero}/>:<div className="notice warning">Geburts- und Todesdatum können gepflegt werden, sobald der <Link href={`/admin/projects/${projectId}/settings/calendar`}>Weltkalender</Link> gültig konfiguriert ist.</div>}<CharacterLifeStatusInput defaultAlive calendar={calendar&&calendarReady?calendar:null}/></section>
        <section><span className="panel-kicker">BESCHREIBUNG & WISSEN · NPCS</span><label>Öffentliche Beschreibung<textarea name="publicDescription" maxLength={100000}/></label><label>Admin-Notizen<textarea name="adminNotes" maxLength={100000}/></label></section><SubmitButton className="primary" pendingLabel="NPC wird angelegt …">NPC anlegen</SubmitButton>
      </form></div></details>
    </div>
    <section className="panel-card npc-browser"><form className="stack" method="get">
      <div className="filter-bar"><label className="search-box"><span aria-hidden="true">⌕</span><input name="q" defaultValue={search.q??""} placeholder="NPC, Race, Klasse oder Beruf suchen …"/></label>
        <select name="alive" defaultValue={search.alive??""}><option value="">Lebendig & verstorben</option><option value="true">Nur lebendig</option><option value="false">Nur verstorben</option></select>
        <select name="gender" defaultValue={gender??""}><option value="">Alle Geschlechter</option>{filterOptions.genders.map((value)=><option key={value} value={value}>{value}</option>)}</select>
        <select name="race" defaultValue={race??""}><option value="">Alle Spezies / Races</option>{filterOptions.races.map((value)=><option key={value} value={value}>{value}</option>)}</select>
        <select name="className" defaultValue={className??""}><option value="">Alle Klassen</option>{filterOptions.classes.map((value)=><option key={value} value={value}>{value}</option>)}</select>
        <select name="follower" defaultValue={search.follower??""}><option value="">Follower & Nicht-Follower</option><option value="true">Nur Follower</option><option value="false">Keine Follower</option></select>
        <select name="visibility" defaultValue={visibility??""}><option value="">Alle Sichtbarkeiten</option><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select>
      </div>
      <div className="field-grid two"><EntityPicker projectId={projectId} name="locationId" types={["location"]} label="Location" placeholder="Location filtern …" initialValue={locationId?String(locationId):""} initialLabel={locationOption?.name??""} initialKind={locationOption?.kind??""} hint="Optional; serverseitige Suche."/><div className="row wrap-row" style={{alignItems:"end"}}><button type="submit">Filter anwenden</button>{hasFilters?<Link className="button ghost" href={path}>Alle Filter zurücksetzen</Link>:null}</div></div>
    </form>
      <div className="table-meta"><span><strong>{result.total}</strong> NPCs / Characters</span><span>{hasFilters?"Mehrere Filter werden gleichzeitig angewendet":"Kanonische Personen-ID: n_id"}</span></div>
      {result.items.length===0?<div className="empty-state large"><strong>Keine NPCs gefunden</strong><span>{hasFilters?"Filter ändern oder zurücksetzen.":"Lege den ersten NPC an."}</span></div>:<div className="table-scroll"><table className="entity-table"><thead><tr><th>Person</th><th>Character</th><th>Status</th><th>Ort</th><th>Profession</th><th>Sichtbarkeit</th><th/></tr></thead><tbody>{result.items.map((npc)=>{const age=calendar&&calendarReady?calculateFantasyAge(birthDate(npc),calendar):null;const ageText=age?.label||(npc.age>0?`${npc.age} Jahre (Legacy)`:"Alter unbekannt");return <tr key={npc.nId}><td><Link className="entity-cell" href={`/admin/projects/${projectId}/npcs/${npc.nId}`}><span className="entity-avatar">{npc.image&&npc.image!=="noimage"?<img src={npc.image} alt="" loading="lazy" width={42} height={42}/>:npc.name.slice(0,1).toUpperCase()}</span><span><strong>{npc.name}</strong><small>{[npc.gender,npc.title||`Person #${npc.nId}`].filter(Boolean).join(" · ")}</small></span></Link></td><td><strong>{npc.race||"—"}</strong><br/><small className="muted">{npc.className||"—"} · {ageText}</small></td><td><strong>{npc.alive?"Lebendig":"Verstorben"}</strong>{npc.follower?<><br/><small className="muted">Follower</small></>:null}</td><td>{npc.location}</td><td>{npc.profession||"—"}</td><td><span className={`visibility-pill ${npc.visibilityMode}`}>{visibilityLabel(npc.visibilityMode)}</span></td><td><Link className="table-action" href={`/admin/projects/${projectId}/npcs/${npc.nId}`}>→</Link></td></tr>;})}</tbody></table></div>}
      <Pagination pathname={path} searchParams={{q:search.q,visibility:search.visibility,alive:search.alive,follower:search.follower,gender:search.gender,locationId:search.locationId,race:search.race,className:search.className}} page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages}/>
    </section>
  </AdminShell>;
}
