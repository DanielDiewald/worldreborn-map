import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmAction } from "@/components/confirm-action";
import { Pagination } from "@/components/pagination";
import { requireAdminSession } from "@/lib/auth/session";
import { listProjectMapsPaginated } from "@/lib/map-admin-queries";
import { mapKindLabel } from "@/lib/map-presentation";
import { parsePagination } from "@/lib/pagination";
import { getProject } from "@/lib/projects";
import { deleteProjectMapAction, resetProjectMapAction } from "../../settings/actions";

type Search = Promise<{ q?: string; page?: string; pageSize?: string }>;

export default async function MapsCollectionPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Search }) {
  await requireAdminSession();
  const [{ projectId: raw }, search] = await Promise.all([params, searchParams]);
  const projectId = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();
  const pagination = parsePagination(search);
  const [project, maps] = await Promise.all([
    getProject(projectId),
    listProjectMapsPaginated(projectId, { query: search.q }, pagination),
  ]);
  if (!project) notFound();
  const path = `/admin/projects/${projectId}/map/maps`;
  const hasFilters = Boolean(search.q);

  return <AdminShell projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Karten`} title="Karten">
    <div className="page-heading compact-heading">
      <div>
        <div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><Link href={`/admin/projects/${projectId}/map`}>Karte</Link><span>/</span><strong>Alle Karten</strong></div>
        <h1>Deine Karten</h1>
        <p>Weltkarten, Städte, Regionen und Dungeons als eigene Arbeitsbereiche. Technische Bild- oder Tile-Quellen bleiben im Hintergrund.</p>
      </div>
      <div className="row wrap-row">
        <Link className="button primary" href={`/admin/projects/${projectId}/settings#new-world-map`}>＋ Neue Weltkarte</Link>
        <Link className="button ghost" href={`/admin/projects/${projectId}/map`}>Hauptkarte öffnen</Link>
      </div>
    </div>

    <section className="panel-card">
      <form className="filter-bar" method="get">
        <label className="search-box"><span aria-hidden="true">⌕</span><input name="q" defaultValue={search.q ?? ""} placeholder="Karte suchen …"/></label>
        <button>Filtern</button>
        {hasFilters ? <Link className="button ghost" href={path}>Zurücksetzen</Link> : null}
      </form>
      <div className="table-meta"><span><strong>{maps.total}</strong> Karten</span><span>Jede Karte kann eigene Ebenen, Orte und Marker besitzen.</span></div>

      {maps.items.length === 0 ? <div className="empty-state large">
        <strong>{hasFilters ? "Keine Karten gefunden" : "Noch keine Karte"}</strong>
        <span>{hasFilters ? "Suche ändern oder zurücksetzen." : "Erstelle deine erste Weltkarte direkt aus einer Rock-3-ZIP."}</span>
        {!hasFilters ? <Link className="button primary" href={`/admin/projects/${projectId}/settings#new-world-map`}>Weltkarte erstellen</Link> : null}
      </div> : <div className="entity-card-grid">{maps.items.map((map) => {
        const isRock3 = Boolean(map.config?.rock3);
        const mapId = Number(map.map_id);
        return <article className="panel-card nested-card" key={map.map_id} style={{ display: "grid", gap: 12 }}>
          <div className="row wrap-row" style={{ justifyContent: "space-between" }}>
            <div><span className="panel-kicker">{mapKindLabel(map.config)}</span><h2 style={{ margin: "3px 0" }}>{map.name}</h2></div>
            <div className="row wrap-row">{map.is_primary ? <span className="visibility-pill all_players">Hauptkarte</span> : null}{isRock3 ? <span className="soft-label">Rock 3</span> : null}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
            <div className="soft-label"><strong>{map.location_count}</strong><br/>Orte</div>
            <div className="soft-label"><strong>{map.country_count}</strong><br/>Länder</div>
            <div className="soft-label"><strong>{map.marker_count}</strong><br/>Marker</div>
          </div>

          <div className="muted">
            {map.rock3_layer_count ? `${map.rock3_layer_count} Rock-3-Ebenen · ` : ""}{map.layer_count} Ebenen · {map.feature_count} gezeichnete Elemente
          </div>

          <div className="row wrap-row">
            <Link className="button primary" href={`/admin/projects/${projectId}/map?mapId=${map.map_id}`}>Karte öffnen</Link>
            <Link className="button ghost" href={`/admin/projects/${projectId}/map/studio?mapId=${map.map_id}`}>Bearbeiten</Link>
            <Link className="button ghost" href={`/admin/projects/${projectId}/map/marker-editor?mapId=${map.map_id}`}>Marker</Link>
            <Link className="button ghost" href={`/admin/projects/${projectId}/settings#map-${map.map_id}`}>Einstellungen</Link>
          </div>

          <details>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Gefahrenbereich</summary>
            <div className="row wrap-row" style={{ marginTop: 10 }}>
              <ConfirmAction
                action={resetProjectMapAction.bind(null, projectId, mapId)}
                title="Karteninhalt zurücksetzen?"
                description={`Alle gezeichneten Länder, Regionen, Provinzen, Orte, Linien und Marker werden von „${map.name}“ entfernt. Die Karte selbst, ihre Rock-3-Daten und Ebenen bleiben erhalten. Verknüpfte Lore-Locations bleiben bestehen und verlieren nur ihre Platzierung auf dieser Karte.`}
                triggerLabel="Inhalte zurücksetzen"
                confirmLabel="Karteninhalt zurücksetzen"
                pendingLabel="Karte wird zurückgesetzt …"
                triggerClassName="button ghost"
                confirmClassName="danger"
              />
              <ConfirmAction
                action={deleteProjectMapAction.bind(null, projectId, mapId)}
                title="Karte endgültig löschen?"
                description={`„${map.name}“ wird samt Ebenen, gezeichneten Inhalten und Markern gelöscht. Lore-Locations bleiben bestehen. Hochgeladene Medien bleiben aus Sicherheitsgründen in der Medienbibliothek.${map.is_primary ? " Eine andere verbleibende Karte wird automatisch zur Hauptkarte; falls keine übrig ist, hat das Projekt danach keine Hauptkarte." : ""}`}
                triggerLabel="Karte löschen"
                confirmLabel="Karte endgültig löschen"
                pendingLabel="Karte wird gelöscht …"
                triggerClassName="button danger"
                confirmClassName="danger"
              />
            </div>
          </details>
        </article>;
      })}</div>}
      <Pagination pathname={path} searchParams={{ q: search.q }} page={maps.page} pageSize={maps.pageSize} total={maps.total} totalPages={maps.totalPages}/>
    </section>
  </AdminShell>;
}
