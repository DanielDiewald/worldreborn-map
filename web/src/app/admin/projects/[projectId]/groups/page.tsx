import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { listGroups } from "@/lib/entities/groups";
import { listLocations } from "@/lib/entities/locations";
import { getProject } from "@/lib/projects";
import { createGroupAction } from "./actions";

export default async function GroupsPage({params}:{params:Promise<{projectId:string}>}){
  await requireAdminSession(); const projectId=Number.parseInt((await params).projectId,10); if(!Number.isSafeInteger(projectId)||projectId<=0) notFound();
  const [project,groups,locations]=await Promise.all([getProject(projectId),listGroups(projectId),listLocations(projectId)]); if(!project) notFound();
  return <AdminShell projectId={projectId} projectName={project.name} section="groups" title="Gruppen" eyebrow={`${project.name} / World`}>
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Gruppen</strong></div><h1>Gruppen & Fraktionen</h1><p>Mitgliedschaften werden als echte Relationen gepflegt; der Legacy-Counter bleibt kompatibel.</p></div>{locations.length>0?<details className="create-dropdown"><summary className="button primary">＋ Gruppe</summary><div className="create-popover"><form action={createGroupAction.bind(null,projectId)} className="stack"><label>Name<input name="name" required/></label><label>Typ<input name="groupType" placeholder="Gilde, Religion, Königreich …"/></label><label>Hauptquartier<select name="locationId" required>{locations.map((l)=><option key={l.loc_id} value={l.loc_id}>{l.name}</option>)}</select></label><label>Motto<input name="motto"/></label><label>Beschreibung / Notizen<textarea name="notes"/></label><label>Bild / Wappen<input name="image"/></label><label>Sichtbarkeit<select name="visibilityMode"><option value="admin_only">Admin only</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select></label><button className="primary">Gruppe anlegen</button></form></div></details>:null}</div>
    {locations.length===0?<section className="panel-card empty-state large"><strong>Erst eine Location anlegen</strong><span>Das Legacy-Schema verlangt für jede Gruppe ein Hauptquartier.</span><Link className="button primary" href={`/admin/projects/${projectId}/locations`}>Locations öffnen</Link></section>:null}
    <section className="panel-card"><div className="table-meta"><span><strong>{groups.length}</strong> Gruppen</span></div>{groups.length===0?<div className="empty-state large"><strong>Keine Gruppen</strong></div>:<div className="table-scroll"><table className="entity-table"><thead><tr><th>Name</th><th>Typ</th><th>Hauptquartier</th><th>Mitglieder</th><th>Sichtbarkeit</th><th/></tr></thead><tbody>{groups.map((g)=><tr key={g.gr_id}><td><strong>{g.name}</strong></td><td>{g.group_type||"—"}</td><td>{g.location_name}</td><td>{g.relation_members}</td><td>{g.visibility_mode}</td><td><Link className="table-action" href={`/admin/projects/${projectId}/groups/${g.gr_id}`}>→</Link></td></tr>)}</tbody></table></div>}</section>
  </AdminShell>;
}
