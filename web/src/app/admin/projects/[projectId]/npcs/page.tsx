import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { Pagination } from "@/components/pagination";
import { requireAdminSession } from "@/lib/auth/session";
import { listNpcsPaginated, type NpcListFilters } from "@/lib/entities/npcs";
import { listLocations } from "@/lib/entities/locations";
import { parsePagination } from "@/lib/pagination";
import { getProject } from "@/lib/projects";
import { createNpcAction } from "./actions";

type Search = Promise<{ q?: string; visibility?: string; page?: string; pageSize?: string }>;
function visibilityLabel(mode:string){return mode==="all_players"?"Alle Spieler":mode==="selected_players"?"Ausgewählte":"Nur Admin";}

export default async function NpcListPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Search}){
  await requireAdminSession();
  const [{projectId:rawProjectId},search]=await Promise.all([params,searchParams]);
  const projectId=Number.parseInt(rawProjectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const [project,locations]=await Promise.all([getProject(projectId),listLocations(projectId)]);if(!project)notFound();
  const visibility=["admin_only","all_players","selected_players"].includes(search.visibility??"")?search.visibility as NpcListFilters["visibility"]:undefined;
  const pagination=parsePagination(search);
  const result=await listNpcsPaginated(projectId,{query:search.q,visibility},pagination);
  const path=`/admin/projects/${projectId}/npcs`;
  return <AdminShell projectId={projectId} projectName={project.name} section="npcs" eyebrow={`${project.name} / World`} title="NPCs">
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>NPCs</strong></div><h1>NPCs & Characters</h1><p>Das Personenprofil (<code>npcs</code>) enthält nur gemeinsame Identitätsdaten. Spielmechanische und Character-spezifische Daten gehören ausschließlich in <code>charakters</code>.</p></div>
      {locations.length?<details className="create-dropdown"><summary className="button primary">＋ Neuer NPC</summary><div className="create-popover" style={{minWidth:620}}><div className="popover-heading"><strong>NPC erstellen</strong><span>Erzeugt Person und Character-Subtype transaktional, ohne Felder doppelt zu pflegen.</span></div><form action={createNpcAction.bind(null,projectId)} className="stack">
        <section><span className="panel-kicker">GEMEINSAME PERSON · NPCS</span><div className="field-grid two"><label>Name<input name="name" maxLength={100} required/></label><label>Personen-Titel<input name="title" maxLength={120}/></label><label>Spezies<input name="species" maxLength={80}/></label><label>Beruf / Profession<input name="profession" maxLength={120}/></label><label>Geschlecht<input name="gender" maxLength={10} placeholder="unknown"/></label><label>Bild / Porträt<input name="image" maxLength={4000} placeholder="https://… oder relativer Pfad"/></label></div></section>
        <section><span className="panel-kicker">CHARACTER SUBTYPE · CHARAKTERS</span><div className="field-grid two"><label>Ort<select name="locationId" required>{locations.map((l)=><option key={l.loc_id} value={l.loc_id}>{l.name}</option>)}</select></label><label>Race<input name="race" maxLength={40}/></label><label>Klasse<input name="className" maxLength={50}/></label><label>Alter<input name="age" type="number" min="0" defaultValue="0"/></label><label>Geburtstag<input name="birthday" type="date" defaultValue="2000-01-01"/></label><label><input name="alive" type="checkbox" defaultChecked/> Lebendig</label><label><input name="follower" type="checkbox"/> Follower</label></div></section>
        <section><span className="panel-kicker">BESCHREIBUNG & WISSEN · NPCS</span><label>Öffentliche Beschreibung<textarea name="publicDescription" maxLength={100000}/></label><label>Admin-Notizen<textarea name="adminNotes" maxLength={100000}/></label></section><button className="primary" type="submit">NPC anlegen</button>
      </form></div></details>:<span className="muted">Zum Anlegen wird zuerst eine Location benötigt.</span>}
    </div>
    <section className="panel-card npc-browser"><form className="filter-bar" method="get"><label className="search-box"><span aria-hidden="true">⌕</span><input name="q" defaultValue={search.q??""} placeholder="NPC, Race, Klasse oder Beruf suchen …"/></label><select name="visibility" defaultValue={visibility??""}><option value="">Alle Sichtbarkeiten</option><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select><button type="submit">Filtern</button></form>
      <div className="table-meta"><span><strong>{result.total}</strong> NPCs / Characters</span><span>Kanonische Personen-ID: n_id</span></div>
      {result.items.length===0?<div className="empty-state large"><strong>Keine NPCs gefunden</strong></div>:<div className="table-scroll"><table className="entity-table"><thead><tr><th>Person</th><th>Character</th><th>Ort</th><th>Profession</th><th>Sichtbarkeit</th><th/></tr></thead><tbody>{result.items.map((npc)=><tr key={npc.nId}><td><Link className="entity-cell" href={`/admin/projects/${projectId}/npcs/${npc.nId}`}><span className="entity-avatar">{npc.image&&npc.image!=="noimage"?<img src={npc.image} alt=""/>:npc.name.slice(0,1).toUpperCase()}</span><span><strong>{npc.name}</strong><small>{[npc.title,npc.species].filter(Boolean).join(" · ")||`Person #${npc.nId}`}</small></span></Link></td><td><strong>{npc.race||"—"}</strong><br/><small className="muted">{npc.className||"—"} · Alter {npc.age}</small></td><td>{npc.location}</td><td>{npc.profession||"—"}</td><td><span className={`visibility-pill ${npc.visibilityMode}`}>{visibilityLabel(npc.visibilityMode)}</span></td><td><Link className="table-action" href={`/admin/projects/${projectId}/npcs/${npc.nId}`}>→</Link></td></tr>)}</tbody></table></div>}
      <Pagination pathname={path} searchParams={{q:search.q,visibility:search.visibility}} page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages}/>
    </section>
  </AdminShell>;
}
