import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { listCharacters } from "@/lib/entities/characters";
import { listLocations } from "@/lib/entities/locations";
import { getProject } from "@/lib/projects";
import { createCharacterAction } from "./actions";

export default async function CharactersPage({params}:{params:Promise<{projectId:string}>}){
  await requireAdminSession();const projectId=Number.parseInt((await params).projectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const [project,characters,locations]=await Promise.all([getProject(projectId),listCharacters(projectId),listLocations(projectId)]);if(!project)notFound();
  return <AdminShell projectId={projectId} projectName={project.name} eyebrow={`${project.name} / World`} title="Spielercharaktere">
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Spielercharaktere</strong></div><h1>Player Characters</h1><p>Spielercharaktere verwenden dieselbe zentrale Personen-ID wie NPCs und Götter.</p></div>{locations.length?<details className="create-dropdown"><summary className="button primary">＋ Charakter</summary><div className="create-popover"><form action={createCharacterAction.bind(null,projectId)} className="stack"><label>Name<input name="name" required/></label><label>Location<select name="locationId" required>{locations.map((l)=><option key={l.loc_id} value={l.loc_id}>{l.name}</option>)}</select></label><label>Rasse<input name="race"/></label><label>Klasse<input name="className"/></label><label>Geburtstag<input name="birthday" type="date" defaultValue="2000-01-01"/></label><label>Alter<input name="age" type="number" min="0" defaultValue="0"/></label><label><input name="alive" type="checkbox" defaultChecked/> Lebendig</label><label>Öffentliche Beschreibung<textarea name="publicDescription"/></label><label>Admin-Notizen<textarea name="adminNotes"/></label><label>Sichtbarkeit<select name="visibilityMode"><option value="admin_only">Admin only</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select></label><button className="primary">Charakter anlegen</button></form></div></details>:null}</div>
    <section className="panel-card"><div className="table-meta"><span><strong>{characters.length}</strong> Charaktere</span></div>{characters.length===0?<div className="empty-state large"><strong>Keine Spielercharaktere</strong></div>:<div className="table-scroll"><table className="entity-table"><thead><tr><th>Name</th><th>Rasse/Klasse</th><th>Ort</th><th>Spieler</th><th>Status</th><th/></tr></thead><tbody>{characters.map((c)=><tr key={c.char_id}><td><strong>{c.name}</strong><br/><small>NPC #{c.n_id}</small></td><td>{c.race} / {c.class}</td><td>{c.location_name}</td><td>{c.player_name||"Nicht zugewiesen"}</td><td>{c.alive?"Lebendig":"Tot"}</td><td><Link className="table-action" href={`/admin/projects/${projectId}/characters/${c.char_id}`}>→</Link></td></tr>)}</tbody></table></div>}</section>
  </AdminShell>;
}
