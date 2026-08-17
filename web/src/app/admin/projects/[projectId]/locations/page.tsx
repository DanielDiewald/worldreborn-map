import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { listLocations } from "@/lib/entities/locations";
import { getProject } from "@/lib/projects";
import { createLocationAction } from "./actions";

export default async function LocationsPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireAdminSession();
  const projectId=Number.parseInt((await params).projectId,10); if(!Number.isSafeInteger(projectId)||projectId<=0) notFound();
  const [project,locations]=await Promise.all([getProject(projectId),listLocations(projectId)]); if(!project) notFound();
  return <AdminShell projectId={projectId} projectName={project.name} section="locations" eyebrow={`${project.name} / World`} title="Locations">
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Locations</strong></div><h1>Orte & Hierarchie</h1><p>Kontinente, Reiche, Städte und Räume bleiben über Parent Locations miteinander verbunden.</p></div>
      <details className="create-dropdown"><summary className="button primary">＋ Location</summary><div className="create-popover"><form action={createLocationAction.bind(null,projectId)} className="stack"><label>Name<input name="name" required maxLength={100}/></label><label>Typ<input name="locationType" maxLength={80}/></label><label>Parent<select name="parentLocId"><option value="">—</option>{locations.map((l:any)=><option key={l.loc_id} value={l.loc_id}>{l.name}</option>)}</select></label><label>Beschreibung<textarea name="description"/></label><label>Wappen/Bild<input name="coatOfArm"/></label><label>Population<input name="population" type="number" min="0"/></label><label>Sichtbarkeit<select name="visibilityMode"><option value="admin_only">Admin only</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select></label><button className="primary">Anlegen</button></form></div></details></div>
    <section className="panel-card"><div className="table-meta"><span><strong>{locations.length}</strong> Locations</span><span>Projekt #{projectId}</span></div>{locations.length===0?<div className="empty-state large"><strong>Keine Locations</strong></div>:<div className="table-scroll"><table className="entity-table"><thead><tr><th>Name</th><th>Typ</th><th>Parent</th><th>Owner</th><th>Sichtbarkeit</th><th/></tr></thead><tbody>{locations.map((l:any)=><tr key={l.loc_id}><td><strong>{l.name}</strong></td><td>{l.location_type||"—"}</td><td>{l.parent_name||"—"}</td><td>{l.owner_name||"—"}</td><td>{l.visibility_mode}</td><td><Link className="table-action" href={`/admin/projects/${projectId}/locations/${l.loc_id}`}>→</Link></td></tr>)}</tbody></table></div>}</section>
  </AdminShell>;
}
