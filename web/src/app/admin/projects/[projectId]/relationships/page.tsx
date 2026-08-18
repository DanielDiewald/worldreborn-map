import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { listRelationshipEntities, listRelationshipTypes, listRelationships } from "@/lib/entities/relationships";
import { getProject } from "@/lib/projects";
import { createRelationshipAction, deleteRelationshipAction } from "./actions";

export default async function RelationshipsPage({params}:{params:Promise<{projectId:string}>}){
  await requireAdminSession();
  const projectId=Number.parseInt((await params).projectId,10);
  if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const [project,relationships,types,entities]=await Promise.all([
    getProject(projectId),listRelationships(projectId),listRelationshipTypes(),listRelationshipEntities(projectId),
  ]);
  if(!project)notFound();

  return <AdminShell projectId={projectId} projectName={project.name} eyebrow={`${project.name} / Wissen`} title="Beziehungen">
    <div className="page-heading compact-heading">
      <div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Beziehungen</strong></div><h1>Relationship System</h1><p>Personen erscheinen genau einmal und werden intern immer über <code>person + n_id</code> referenziert.</p></div>
      <details className="create-dropdown"><summary className="button primary">＋ Beziehung</summary><div className="create-popover"><form action={createRelationshipAction.bind(null,projectId)} className="stack">
        <label>Entity A<select name="entityARef" required>{entities.map((entity)=><option key={`a-${entity.entity_type}-${entity.entity_id}`} value={`${entity.entity_type}:${entity.entity_id}`}>{entity.name} · {entity.badge}</option>)}</select></label>
        <label>Entity B<select name="entityBRef" required>{entities.map((entity)=><option key={`b-${entity.entity_type}-${entity.entity_id}`} value={`${entity.entity_type}:${entity.entity_id}`}>{entity.name} · {entity.badge}</option>)}</select></label>
        <label>Typ<select name="relationshipTypeId">{types.map((type)=><option key={type.relationship_type_id} value={type.relationship_type_id}>{type.label}{type.directed?" →":""}</option>)}</select></label>
        <label>Status<input name="status" defaultValue="active"/></label>
        <label>Öffentliche Beschreibung<textarea name="publicDescription"/></label>
        <label>Admin-Notizen<textarea name="adminNotes"/></label>
        <label>Sichtbarkeit<select name="visibilityMode"><option value="admin_only">Admin only</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select></label>
        <button className="primary">Beziehung anlegen</button>
      </form></div></details>
    </div>
    <section className="panel-card"><div className="table-meta"><span><strong>{relationships.length}</strong> Beziehungen</span><span><Link href={`/admin/projects/${projectId}/family-tree`}>Family Tree</Link> · <Link href={`/admin/projects/${projectId}/relationship-graph`}>Graph</Link></span></div>
      {relationships.length===0?<div className="empty-state large"><strong>Keine Beziehungen</strong></div>:<div className="table-scroll"><table className="entity-table"><thead><tr><th>A</th><th>Typ</th><th>B</th><th>Status</th><th>Sichtbarkeit</th><th/></tr></thead><tbody>{relationships.map((r)=><tr key={r.relationship_id}><td>{r.entity_a_type} #{r.entity_a_id}</td><td><strong>{r.type_label}</strong>{r.directed?" →":" ↔"}</td><td>{r.entity_b_type} #{r.entity_b_id}</td><td>{r.status}</td><td>{r.visibility_mode}</td><td>{r.metadata.legacy_source?<small className="muted">Legacy geschützt</small>:<form action={deleteRelationshipAction.bind(null,projectId,Number(r.relationship_id))}><button className="button ghost">Entfernen</button></form>}</td></tr>)}</tbody></table></div>}
    </section>
  </AdminShell>;
}
