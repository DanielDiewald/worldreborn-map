import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { getGod } from "@/lib/entities/gods";
import { getProject } from "@/lib/projects";
import { archiveGodAction, updateGodAction } from "../actions";

export default async function GodDetailPage({ params }: { params: Promise<{ projectId: string; godId: string }> }) {
  await requireAdminSession();
  const raw=await params; const projectId=Number.parseInt(raw.projectId,10); const godId=Number.parseInt(raw.godId,10);
  if(!Number.isSafeInteger(projectId)||!Number.isSafeInteger(godId)||projectId<=0||godId<=0) notFound();
  const [project,god]=await Promise.all([getProject(projectId),getGod(projectId,godId)]); if(!project||!god) notFound();
  return <AdminShell projectId={projectId} projectName={project.name} section="gods" title={god.name} eyebrow={`${project.name} / Götter`}>
    <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/gods`}>Götter</Link><span>/</span><strong>{god.name}</strong></div>
    <section className="entity-hero"><div className="entity-avatar hero-avatar">{god.image&&god.image!=="noimage"?<img src={god.image} alt=""/>:god.name.slice(0,1)}</div><div className="entity-hero-main"><span className="page-kicker">GOD #{god.god_id} · NPC #{god.npc_id}</span><h1>{god.name}</h1><p>{god.god_title} · {god.domain}</p></div></section>
    <form action={updateGodAction.bind(null,projectId,godId)} className="npc-detail-grid"><div className="stack detail-main"><section className="panel-card edit-section"><div className="field-grid two"><label>Name<input name="name" defaultValue={god.name} required/></label><label>Göttlicher Titel<input name="godTitle" defaultValue={god.god_title}/></label><label>Domain<input name="domain" defaultValue={god.domain}/></label><label>Fraktion/Pantheon<input name="faction" defaultValue={god.faction}/></label><label>Personen-Titel<input name="personTitle" defaultValue={god.person_title??""}/></label><label>Spezies<input name="species" defaultValue={god.species??""}/></label><label>Rolle<input name="profession" defaultValue={god.profession??""}/></label><label>Geschlecht<input name="gender" defaultValue={god.gender}/></label><label>Bild<input name="image" defaultValue={god.image==="noimage"?"":god.image}/></label><label>Sichtbarkeit<select name="visibilityMode" defaultValue={god.visibility_mode}><option value="admin_only">Admin only</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select></label></div><label>Öffentliche Beschreibung<textarea name="publicDescription" className="large-textarea" defaultValue={god.public_description??""}/></label><label>Admin-Notizen<textarea name="adminNotes" className="large-textarea" defaultValue={god.admin_notes??god.notes}/></label></section><div className="sticky-savebar"><div><strong>Gottheit speichern</strong><span>NPC- und God-ID bleiben erhalten.</span></div><button className="primary">Speichern</button></div></div></form>
    <section className="danger-zone"><div><h2>Gottheit archivieren</h2><p>Die Person wird archiviert, nicht gelöscht.</p></div><form action={archiveGodAction.bind(null,projectId,godId)}><button className="danger">Archivieren</button></form></section>
  </AdminShell>;
}
