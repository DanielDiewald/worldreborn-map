import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { getGod } from "@/lib/entities/gods";
import { getProject } from "@/lib/projects";
import { archiveGodAction, updateGodAction } from "../actions";

function visibilityLabel(mode:string){return mode==="all_players"?"Alle Spieler":mode==="selected_players"?"Ausgewählte Spieler":"Nur Admin";}

export default async function GodDetailPage({ params }: { params: Promise<{ projectId: string; godId: string }> }) {
  await requireAdminSession();
  const raw=await params; const projectId=Number.parseInt(raw.projectId,10); const godId=Number.parseInt(raw.godId,10);
  if(!Number.isSafeInteger(projectId)||!Number.isSafeInteger(godId)||projectId<=0||godId<=0) notFound();
  const [project,god]=await Promise.all([getProject(projectId),getGod(projectId,godId)]); if(!project||!god) notFound();
  return <AdminShell projectId={projectId} projectName={project.name} section="gods" title={god.name} eyebrow={`${project.name} / Götter`}>
    <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/gods`}>Götter</Link><span>/</span><strong>{god.name}</strong></div>
    <section className="entity-hero"><div className="entity-avatar hero-avatar">{god.image&&god.image!=="noimage"?<img src={god.image} alt=""/>:god.name.slice(0,1).toUpperCase()}</div><div className="entity-hero-main"><span className="page-kicker">Person #{god.person_id} · God-Subtype #{god.god_id}</span><h1>{god.name}</h1><p>{[god.god_title,god.domain,god.faction].filter((value:string)=>value&&value!=="unknown").join(" · ")||"Gottheit"}</p><div className="hero-tags"><span className="soft-label">God</span><span className={`visibility-pill ${god.visibility_mode}`}>{visibilityLabel(god.visibility_mode)}</span></div></div></section>
    <form action={updateGodAction.bind(null,projectId,godId)} className="npc-detail-grid"><div className="stack detail-main">
      <section className="panel-card edit-section"><div className="panel-heading"><div><span className="panel-kicker">GEMEINSAME PERSON · NPCS</span><h2>Identität & Basisprofil</h2></div><span className="record-id">n_id #{god.person_id}</span></div><p className="section-help">Diese Felder gehören zur Person und werden auch von Relationships, Gruppen und Stammbäumen verwendet. Hier stehen keine God-spezifischen Eigenschaften.</p><div className="field-grid two"><label>Name<input name="name" defaultValue={god.name} required/></label><label>Personen-Titel<input name="personTitle" defaultValue={god.person_title??""}/></label><label>Spezies<input name="species" defaultValue={god.species??""}/></label><label>Beruf / Rolle<input name="profession" defaultValue={god.profession??""}/></label><label>Geschlecht<input name="gender" defaultValue={god.gender}/></label><label>Bild / Porträt<input name="image" defaultValue={god.image==="noimage"?"":god.image}/></label><label>Sichtbarkeit<select name="visibilityMode" defaultValue={god.visibility_mode}><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte</option></select></label></div></section>
      <section className="panel-card edit-section"><div className="panel-heading"><div><span className="panel-kicker">GOD SUBTYPE · GODS</span><h2>Göttliche Eigenschaften</h2></div><span className="record-id">g_id #{god.god_id}</span></div><p className="section-help">Nur Eigenschaften, die ausschließlich für Gottheiten gelten.</p><div className="field-grid two"><label>Göttlicher Titel<input name="godTitle" defaultValue={god.god_title}/></label><label>Domain<input name="domain" defaultValue={god.domain}/></label><label>Fraktion / Pantheon<input name="faction" defaultValue={god.faction}/></label></div></section>
      <section className="panel-card edit-section"><div className="panel-heading"><div><span className="panel-kicker">SPIELER-WISSEN · NPCS</span><h2>Öffentliche Beschreibung</h2></div></div><textarea name="publicDescription" className="large-textarea" defaultValue={god.public_description??""}/></section>
      <section className="panel-card edit-section secret-section"><div className="panel-heading"><div><span className="panel-kicker">ADMIN ONLY · NPCS</span><h2>Geheime Notizen</h2></div></div><textarea name="adminNotes" className="large-textarea" defaultValue={god.admin_notes??god.notes}/></section>
      <div className="sticky-savebar"><div><strong>Gottheit speichern</strong><span>n_id bleibt Personen-ID; g_id bleibt ausschließlich Subtype-ID.</span></div><button className="primary">Speichern</button></div>
    </div><aside className="stack detail-side"><section className="panel-card profile-summary"><div className="panel-heading"><div><span className="panel-kicker">VERKNÜPFUNGEN</span><h2>World Context</h2></div></div><div className="stack"><Link className="button" href={`/admin/projects/${projectId}/relationships?personId=${god.person_id}`}>Beziehungen anzeigen</Link><Link className="button" href={`/admin/projects/${projectId}/family-trees/all`}>Im Familiengraph anzeigen</Link><Link className="button" href={`/admin/projects/${projectId}/groups`}>Gruppen durchsuchen</Link></div></section></aside></form>
    <section className="danger-zone"><div><h2>Gottheit archivieren</h2><p>Die Person wird archiviert, nicht physisch gelöscht.</p></div><form action={archiveGodAction.bind(null,projectId,godId)}><button className="danger">Archivieren</button></form></section>
  </AdminShell>;
}
