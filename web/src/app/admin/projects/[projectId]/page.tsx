import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { EntityImageFrame } from "@/components/entity-image-frame";
import { requireAdminSession } from "@/lib/auth/session";
import { getProjectDashboard } from "@/lib/dashboard";
import { entityListImageUrl } from "@/lib/entity-image-url";
import { getProject } from "@/lib/projects";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function Metric({ label, value, hint, icon }: { label: string; value: number; hint: string; icon: string }) {
  return <div className="metric-card"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{hint}</small></div></div>;
}

export default async function ProjectDashboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireAdminSession();
  const projectId=Number.parseInt((await params).projectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const [project,dashboard]=await Promise.all([getProject(projectId),getProjectDashboard(projectId)]);if(!project)notFound();

  return <AdminShell projectId={projectId} projectName={project.name} section="dashboard" eyebrow={`${project.name} / Übersicht`} title="Dashboard">
    <div className="page-heading dashboard-heading"><div><span className="page-kicker">AKTIVE WELT</span><h1>{project.name}</h1><p>Deine zentrale Übersicht über Personen, Orte, Fraktionen und die räumliche Welt.</p></div><div className="heading-actions"><Link href={`/admin/projects/${projectId}/map`} className="button primary">Weltkarte öffnen</Link><Link href={`/admin/projects/${projectId}/npcs`} className="button ghost">＋ NPC erstellen</Link></div></div>

    <section className="metrics-grid"><Metric label="NPCs" value={dashboard.stats.npcs} hint="aktive Einträge" icon="♙"/><Metric label="Götter" value={dashboard.stats.gods} hint="Personen-Spezialisierung" icon="✦"/><Metric label="Orte" value={dashboard.stats.locations} hint="räumliche Locations" icon="⌖"/><Metric label="Gruppen" value={dashboard.stats.groups} hint="Fraktionen & Häuser" icon="◇"/><Metric label="Timeline" value={dashboard.stats.events} hint="Events" icon="⌁"/><Metric label="Spieler" value={dashboard.stats.players} hint="aktive Accounts" icon="◉"/></section>

    <div className="dashboard-grid"><section className="panel-card recent-panel"><div className="panel-heading"><div><span className="panel-kicker">WORLD DATA</span><h2>Zuletzt bearbeitete NPCs</h2></div><Link href={`/admin/projects/${projectId}/npcs`}>Alle NPCs →</Link></div>{dashboard.recentNpcs.length?<div className="recent-list">{dashboard.recentNpcs.map(npc=><Link key={npc.id} href={`/admin/projects/${projectId}/npcs/${npc.id}`} className="recent-row"><EntityImageFrame className="entity-avatar small" mode="thumbnail" src={entityListImageUrl(projectId,"person",npc.id,npc.image)} fallback={npc.name.slice(0,1).toUpperCase()} alt=""/><div className="recent-main"><strong>{npc.name}</strong><span>{npc.title||"NPC"}</span></div><time>{formatDate(npc.updatedAt)}</time><span className="row-arrow">→</span></Link>)}</div>:<div className="empty-state"><strong>Noch keine NPCs</strong><span>Erstelle den ersten Eintrag für diese Welt.</span></div>}</section>
      <aside className="dashboard-side stack"><section className="panel-card world-health"><div className="panel-heading"><div><span className="panel-kicker">SYSTEM</span><h2>Welt-Status</h2></div></div><div className="health-row"><span>Datenbank</span><strong><i className="health-dot ok"/> verbunden</strong></div><div className="health-row"><span>Kartenmarker</span><strong>{dashboard.stats.markers}</strong></div><div className="health-row"><span>Charaktere</span><strong>{dashboard.stats.characters}</strong></div><div className="health-row"><span>Projekt-ID</span><strong>#{projectId}</strong></div></section>
      <section className="panel-card quick-panel"><div className="panel-heading"><div><span className="panel-kicker">SCHNELLZUGRIFF</span><h2>Direkt weiterarbeiten</h2></div></div><Link href={`/admin/projects/${projectId}/map`} className="quick-link"><span className="quick-icon">⌖</span><div><strong>Weltkarte</strong><small>Länder, Orte, Klima & Terrain</small></div><b>→</b></Link><Link href={`/admin/projects/${projectId}/map/studio`} className="quick-link"><span className="quick-icon">✎</span><div><strong>Welt bearbeiten</strong><small>Land, Stadt, Fluss oder Straße</small></div><b>→</b></Link><Link href={`/admin/projects/${projectId}/npcs`} className="quick-link"><span className="quick-icon">♙</span><div><strong>NPC-Verwaltung</strong><small>Personen & räumliche Orte</small></div><b>→</b></Link><Link href={`/admin/projects/${projectId}/locations`} className="quick-link"><span className="quick-icon">◎</span><div><strong>Orte</strong><small>Hierarchie & Kartenbindung</small></div><b>→</b></Link></section></aside>
    </div>
  </AdminShell>;
}