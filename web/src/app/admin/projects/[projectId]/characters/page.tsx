import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { listPlayerCharacters, listUnassignedCharacters } from "@/lib/entities/characters";
import { listPlayers } from "@/lib/players";
import { getProject } from "@/lib/projects";
import { assignCharacterAction } from "./actions";

export default async function CharactersPage({params}:{params:Promise<{projectId:string}>}){
  await requireAdminSession();const projectId=Number.parseInt((await params).projectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const [project,assigned,unassigned,players]=await Promise.all([getProject(projectId),listPlayerCharacters(projectId),listUnassignedCharacters(projectId),listPlayers(projectId)]);if(!project)notFound();
  return <AdminShell projectId={projectId} projectName={project.name} eyebrow={`${project.name} / World`} title="Spielercharaktere">
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Spielercharaktere</strong></div><h1>Player Characters</h1><p>Ein Player Character ist <code>npcs + charakters + chars + users</code>. Nicht zugewiesene Character-Personen bleiben normale NPCs.</p></div></div>
    <section className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">ASSIGNED</span><h2>Zugewiesene Player Characters</h2></div><strong>{assigned.length}</strong></div>{assigned.length===0?<div className="empty-state large"><strong>Keine Player Characters zugewiesen</strong><span>Der Legacy-Datensatz enthält erwartungsgemäß 0 chars.</span></div>:<div className="table-scroll"><table className="entity-table"><thead><tr><th>Person</th><th>Spieler</th><th>Race / Klasse</th><th>Ort</th><th/></tr></thead><tbody>{assigned.map((c)=><tr key={c.n_id}><td><strong>{c.name}</strong><br/><small>n_id #{c.n_id} · char_id #{c.char_id}</small></td><td>{c.player_name}</td><td>{c.race} / {c.class}</td><td>{c.location_name}</td><td><Link className="table-action" href={`/admin/projects/${projectId}/characters/${c.char_id}`}>→</Link></td></tr>)}</tbody></table></div>}</section>
    <section className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">CANDIDATES</span><h2>Nicht zugewiesene NPCs</h2></div><strong>{unassigned.length}</strong></div>{unassigned.length===0?<div className="empty-state"><strong>Keine freien Character-Personen</strong></div>:<div className="table-scroll"><table className="entity-table"><thead><tr><th>NPC</th><th>Race / Klasse</th><th>Spieler zuweisen</th><th/></tr></thead><tbody>{unassigned.map((c)=><tr key={c.n_id}><td><strong>{c.name}</strong><br/><small>Person #{c.n_id}</small></td><td>{c.race} / {c.class}</td><td><form action={assignCharacterAction.bind(null,projectId,c.char_id)} className="row"><select name="playerId" defaultValue=""><option value="">Spieler wählen …</option>{players.filter((p)=>p.active).map((p)=><option key={p.userId} value={p.userId}>{p.displayName}</option>)}</select><button type="submit">Zuweisen</button></form></td><td><Link className="table-action" href={`/admin/projects/${projectId}/characters/${c.char_id}`}>→</Link></td></tr>)}</tbody></table></div>}</section>
  </AdminShell>;
}
