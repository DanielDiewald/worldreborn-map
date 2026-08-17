import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { listNpcs, type NpcListFilters } from "@/lib/entities/npcs";
import { getProject } from "@/lib/projects";
import { createNpcAction } from "./actions";

type Search = Promise<{ q?: string; visibility?: string }>;

function visibilityLabel(mode: string) {
  if (mode === "all_players") return "Alle Spieler";
  if (mode === "selected_players") return "Ausgewählte";
  return "Admin only";
}

export default async function NpcListPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Search }) {
  await requireAdminSession();
  const [{ projectId: rawProjectId }, search] = await Promise.all([params, searchParams]);
  const projectId = Number.parseInt(rawProjectId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();

  const project = await getProject(projectId);
  if (!project) notFound();

  const visibility = ["admin_only", "all_players", "selected_players"].includes(search.visibility ?? "")
    ? search.visibility as NpcListFilters["visibility"]
    : undefined;
  const items = await listNpcs(projectId, { query: search.q, visibility });
  const createAction = createNpcAction.bind(null, projectId);

  return (
    <AdminShell projectId={projectId} projectName={project.name} section="npcs" eyebrow={`${project.name} / World`} title="NPCs">
      <div className="page-heading compact-heading">
        <div>
          <div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>NPCs</strong></div>
          <h1>NPC-Verwaltung</h1>
          <p>Personen dieser Welt verwalten, durchsuchen und bearbeiten. Alle Ergebnisse sind auf dieses Projekt begrenzt.</p>
        </div>
        <details className="create-dropdown">
          <summary className="button primary">＋ Neuer NPC</summary>
          <div className="create-popover">
            <div className="popover-heading"><strong>NPC erstellen</strong><span>Standardmäßig nur für Admins sichtbar.</span></div>
            <form action={createAction} className="stack">
              <div className="field-grid two">
                <label>Name<input name="name" maxLength={100} required /></label>
                <label>Titel<input name="title" maxLength={120} /></label>
                <label>Spezies / Race<input name="species" maxLength={80} /></label>
                <label>Beruf<input name="profession" maxLength={120} /></label>
                <label>Geschlecht<input name="gender" maxLength={10} placeholder="unknown" /></label>
                <label>Bild-URL<input name="image" maxLength={4000} /></label>
              </div>
              <label>Öffentliche Beschreibung<textarea name="publicDescription" maxLength={100000} /></label>
              <label>Geheime Admin-Notizen<textarea name="adminNotes" maxLength={100000} /></label>
              <div className="row end"><button className="primary" type="submit">NPC anlegen</button></div>
            </form>
          </div>
        </details>
      </div>

      <section className="panel-card npc-browser">
        <form className="filter-bar" method="get">
          <label className="search-box">
            <span aria-hidden="true">⌕</span>
            <input name="q" defaultValue={search.q ?? ""} placeholder="NPC suchen nach Name, Titel, Spezies oder Beruf …" />
          </label>
          <select name="visibility" defaultValue={visibility ?? ""} aria-label="Sichtbarkeit filtern">
            <option value="">Alle Sichtbarkeiten</option>
            <option value="admin_only">Admin only</option>
            <option value="all_players">Alle Spieler</option>
            <option value="selected_players">Ausgewählte Spieler</option>
          </select>
          <button type="submit">Filtern</button>
          {(search.q || visibility) ? <Link className="button ghost" href={`/admin/projects/${projectId}/npcs`}>Zurücksetzen</Link> : null}
        </form>

        <div className="table-meta">
          <span><strong>{items.length}</strong> NPC{items.length === 1 ? "" : "s"}</span>
          <span>PostgreSQL · Projekt #{projectId}</span>
        </div>

        {items.length === 0 ? (
          <div className="empty-state large"><strong>Keine NPCs gefunden</strong><span>Ändere die Filter oder lege einen neuen NPC an.</span></div>
        ) : (
          <div className="table-scroll">
            <table className="entity-table">
              <thead><tr><th>NPC</th><th>Spezies</th><th>Beruf</th><th>Geschlecht</th><th>Sichtbarkeit</th><th /></tr></thead>
              <tbody>
                {items.map((npc) => (
                  <tr key={npc.nId}>
                    <td>
                      <Link className="entity-cell" href={`/admin/projects/${projectId}/npcs/${npc.nId}`}>
                        <span className="entity-avatar">
                          {npc.image && npc.image !== "noimage" ? <img src={npc.image} alt="" /> : npc.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span><strong>{npc.name}</strong><small>{npc.title || `NPC #${npc.nId}`}</small></span>
                      </Link>
                    </td>
                    <td>{npc.species || <span className="muted">—</span>}</td>
                    <td>{npc.profession || <span className="muted">—</span>}</td>
                    <td><span className="soft-label">{npc.gender || "unknown"}</span></td>
                    <td><span className={`visibility-pill ${npc.visibilityMode}`}>{visibilityLabel(npc.visibilityMode)}</span></td>
                    <td><Link className="table-action" href={`/admin/projects/${projectId}/npcs/${npc.nId}`} aria-label={`${npc.name} öffnen`}>→</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
