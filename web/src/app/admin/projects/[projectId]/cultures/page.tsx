import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { EntityPicker } from "@/components/entity-picker";
import { ImageSourceInput } from "@/components/image-source-input";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminSession } from "@/lib/auth/session";
import { listCultures } from "@/lib/entities/cultures";
import { getProject } from "@/lib/projects";
import { createCultureAction } from "./actions";

function visibilityLabel(value: string) { return value === "all_players" ? "Alle Spieler" : value === "selected_players" ? "Ausgewählte Spieler" : "Nur Admin"; }

export default async function CulturesPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireAdminSession(); const projectId = Number.parseInt((await params).projectId, 10); if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();
  const [project, cultures] = await Promise.all([getProject(projectId), listCultures(projectId)]); if (!project) notFound();
  return <AdminShell projectId={projectId} projectName={project.name} section="cultures" eyebrow={`${project.name} / Welt`} title="Kulturen & Völker">
    <div className="page-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Kulturen & Völker</strong></div><h1>Kulturen & Völker</h1><p>Kultur ist bewusst von Biologie getrennt. Eine Kultur kann mehrere Spezies oder Subspezies umfassen und besitzt einen eigenen geografischen Schwerpunkt.</p></div><Link className="button" href={`/admin/projects/${projectId}/races`}>Spezies öffnen</Link></div>
    <section className="panel-card stack"><div className="panel-heading"><div><span className="panel-kicker">NEUER WELTDATENSATZ</span><h2>Kultur / Volk anlegen</h2></div></div><form action={createCultureAction.bind(null, projectId)} className="stack">
      <div className="field-grid two"><label>Name<input name="name" maxLength={160} required placeholder="z. B. Aelvari"/></label><label>Sichtbarkeit<select name="visibilityMode" defaultValue="admin_only"><option value="admin_only">Nur Admin</option><option value="all_players">Alle Spieler</option><option value="selected_players">Ausgewählte Spieler</option></select></label></div>
      <EntityPicker projectId={projectId} name="primaryLocationId" types={["location"]} label="Kulturelles Kerngebiet" placeholder="Optionalen Ort suchen …" hint="Kann ein Land, eine Region, Provinz, Stadt oder anderer Ort sein."/>
      <ImageSourceInput label="Vorschaubild / Symbol"/>
      <label>Beschreibung<textarea name="description" className="large-textarea" maxLength={100000} placeholder="Sprache, Bräuche, Kleidung, Gesellschaft, Religion, Geschichte …"/></label>
      <SubmitButton className="primary" pendingLabel="Kultur wird angelegt …">Kultur anlegen</SubmitButton>
    </form></section>
    <section className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">KULTURREGISTER</span><h2>{cultures.length} Kulturen / Völker</h2></div></div>{cultures.length === 0 ? <div className="empty-state large"><strong>Noch keine Kulturen</strong><span>Lege oben die erste Kultur an und verknüpfe sie anschließend mit einer oder mehreren Spezies.</span></div> : <div className="table-scroll"><table className="entity-table"><thead><tr><th>Kultur</th><th>Kerngebiet</th><th>Spezies</th><th>Sichtbarkeit</th><th/></tr></thead><tbody>{cultures.map((culture) => <tr key={culture.cultureId}><td><Link className="entity-cell" href={`/admin/projects/${projectId}/cultures/${culture.cultureId}`}><span className="entity-avatar">{culture.image && culture.image !== "noimage" ? <img src={culture.image} alt="" loading="lazy"/> : culture.name.slice(0,1).toUpperCase()}</span><span><strong>{culture.name}</strong><small>{culture.description?.trim() ? culture.description.slice(0,90) : "Noch keine Beschreibung"}</small></span></Link></td><td>{culture.primaryLocationName || "—"}</td><td>{culture.raceCount}</td><td>{visibilityLabel(culture.visibilityMode)}</td><td><Link className="table-action" href={`/admin/projects/${projectId}/cultures/${culture.cultureId}`}>→</Link></td></tr>)}</tbody></table></div>}</section>
  </AdminShell>;
}
