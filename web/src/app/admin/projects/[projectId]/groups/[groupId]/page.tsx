import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { getGroup } from "@/lib/entities/groups";
import { listLocations } from "@/lib/entities/locations";
import { getProject } from "@/lib/projects";
import { archiveGroupAction, updateGroupAction } from "../actions";

export default async function GroupDetailPage({params}:{params:Promise<{projectId:string;groupId:string}>}){
  await requireAdminSession();const raw=await params;const projectId=Number.parseInt(raw.projectId,10);const groupId=Number.parseInt(raw.groupId,10);if(!Number.isSafeInteger(projectId)||!Number.isSafeInteger(groupId)||projectId<=0||groupId<=0)notFound();
  const [project,group,locations]=await Promise.all([getProject(projectId),getGroup(projectId,groupId),listLocations(projectId)]);if(!project||!group)notFound();
  return <AdminShell projectId={projectId} projectName={project.name} section="groups" title={String(group.name)} eyebrow={`${project.name} / Gruppen`}>
    <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/groups`}>Gruppen</Link><span>/</span><strong>{String(group.name)}</strong></div>
    <form action={updateGroupAction.bind(null,projectId,groupId)} className="npc-detail-grid"><div className="stack detail-main"><section className="panel-card edit-section"><div className="field-grid two"><label>Name<input name="name" defaultValue={String(group.name)} required/></label><label>Typ<input name="groupType" defaultValue={group.group_type?String(group.group_type):""}/></label><label>Hauptquartier<select name="locationId" defaultValue={String(group.loc_id)}>{locations.map((l)=><option key={l.loc_id} value={l.loc_id}>{l.name}</option>)}</select></label><label>Motto<input name="motto" defaultValue={String(group.motto)}/></label><label>Bild/Wappen<input name="image" defaultValue={String(group.image)==="noimage"?"":String(group.image)}/></label><label>Sichtbarkeit<select name="visibilityMode" defaultValue={String(group.visibility_mode)}><option value="admin_only">Admin only</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select></label></div><label>Beschreibung / Notizen<textarea className="large-textarea" name="notes" defaultValue={String(group.notes)}/></label></section><div className="sticky-savebar"><div><strong>Gruppe speichern</strong><span>Mitgliedschaften bleiben erhalten.</span></div><button className="primary">Speichern</button></div></div></form>
    <section className="danger-zone"><div><h2>Gruppe archivieren</h2><p>Keine harte Löschung.</p></div><form action={archiveGroupAction.bind(null,projectId,groupId)}><button className="danger">Archivieren</button></form></section>
  </AdminShell>;
}
