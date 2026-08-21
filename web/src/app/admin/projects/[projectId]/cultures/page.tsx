import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { EntityImageFrame } from "@/components/entity-image-frame";
import { requireAdminSession } from "@/lib/auth/session";
import { listCultures } from "@/lib/entities/cultures";
import { getProject } from "@/lib/projects";
import { CultureCreateDialog } from "./culture-create-dialog";

function visibilityLabel(value: string) { return value === "all_players" ? "Alle Spieler" : value === "selected_players" ? "Ausgewählte Spieler" : "Nur Admin"; }

export default async function CulturesPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireAdminSession(); const projectId = Number.parseInt((await params).projectId, 10); if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();
  const [project, cultures] = await Promise.all([getProject(projectId), listCultures(projectId)]); if (!project) notFound();
  return <AdminShell projectId={projectId} projectName={project.name} section="cultures" eyebrow={`${project.name} / Welt`} title="Kulturen & Völker">
    <div className="page-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Kulturen & Völker</strong></div><h1>Kulturen & Völker</h1><p>Kultur ist bewusst von Biologie getrennt. Eine Kultur kann mehrere Spezies oder Subspezies umfassen und besitzt einen eigenen geografischen Schwerpunkt.</p></div><div className="row wrap-row"><Link className="button" href={`/admin/projects/${projectId}/races`}>Spezies öffnen</Link><CultureCreateDialog projectId={projectId}/></div></div>
    <section className="panel-card"><div className="panel-heading"><div><span className="panel-kicker">KULTURREGISTER</span><h2>{cultures.length} Kulturen / Völker</h2><p className="section-help">Listen laden für verwaltete Bilder nur kleine 256px-Derivate; das Original bleibt für die Detailansicht erhalten.</p></div></div>{cultures.length === 0 ? <div className="empty-state large"><strong>Noch keine Kulturen</strong><span>Lege die erste Kultur an und verknüpfe sie anschließend mit einer oder mehreren Spezies.</span></div> : <div className="table-scroll"><table className="entity-table"><thead><tr><th>Kultur</th><th>Kerngebiet</th><th>Spezies</th><th>Sichtbarkeit</th><th/></tr></thead><tbody>{cultures.map((culture) => <tr key={culture.cultureId}><td><Link className="entity-cell" href={`/admin/projects/${projectId}/cultures/${culture.cultureId}`}><EntityImageFrame className="entity-avatar" mode="thumbnail" src={culture.image} fallback={culture.name.slice(0,1).toUpperCase()} alt={`${culture.name} – Kultur`}/><span><strong>{culture.name}</strong><small>{culture.description?.trim() ? culture.description.slice(0,90) : "Noch keine Beschreibung"}</small></span></Link></td><td>{culture.primaryLocationName || "—"}</td><td>{culture.raceCount}</td><td>{visibilityLabel(culture.visibilityMode)}</td><td><Link className="table-action" aria-label={`${culture.name} öffnen`} href={`/admin/projects/${projectId}/cultures/${culture.cultureId}`}>→</Link></td></tr>)}</tbody></table></div>}</section>
  </AdminShell>;
}
