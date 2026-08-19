import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { WorldMapViewer } from "@/components/map/world-map-viewer";
import { requireAdminSession } from "@/lib/auth/session";
import { listMapFeatures, listMapLayers } from "@/lib/map-features";
import { listMapMarkers, listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";

function positive(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function AdminMapPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ mapId?: string; featureId?: string; markerId?: string }>;
}) {
  await requireAdminSession();
  const [raw, search] = await Promise.all([params, searchParams]);
  const projectId = Number.parseInt(raw.projectId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();

  const [project, maps] = await Promise.all([getProject(projectId), listProjectMaps(projectId)]);
  if (!project) notFound();

  const requested = positive(search.mapId);
  const selected = maps.find((map) => Number(map.map_id) === requested) ?? maps.find((map) => map.is_primary) ?? maps[0];
  if (!selected) {
    return <AdminShell projectId={projectId} projectName={project.name} section="map" title="Karte">
      <section className="panel-card empty-state large">
        <strong>Noch keine Karte vorhanden</strong>
        <span>Erstelle deine Weltkarte direkt aus einer Rock-3-ZIP. Technische Image- oder Tile-Angaben sind dafür nicht nötig.</span>
        <Link className="button primary" href={`/admin/projects/${projectId}/settings`}>Weltkarte erstellen</Link>
      </section>
    </AdminShell>;
  }

  const mapId = Number(selected.map_id);
  const [markers, layers, features] = await Promise.all([
    listMapMarkers(projectId, mapId),
    listMapLayers(projectId, mapId),
    listMapFeatures(projectId, mapId),
  ]);
  const config = {
    mapId,
    mapType: selected.map_type as "tile" | "image",
    tileUrl: selected.tile_url,
    imagePath: selected.image_path,
    minZoom: selected.min_zoom,
    maxZoom: selected.max_zoom,
    centerLat: selected.center_lat,
    centerLng: selected.center_lng,
    bounds: selected.bounds,
    config: selected.config,
  };

  return <AdminShell projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Welt`} title={selected.name}>
    <div className="page-heading compact-heading">
      <div>
        <div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Karte</strong></div>
        <h1>{selected.name}</h1>
        <p>Die zentrale Weltansicht für Länder, Orte, Klima, Terrain und Marker. Zum Bearbeiten wechselst du direkt in den passenden Modus.</p>
      </div>
      <div className="row wrap-row">
        {maps.length > 1 ? <form method="get" className="row">
          <select name="mapId" defaultValue={String(mapId)} aria-label="Karte auswählen">
            {maps.map((map) => <option key={map.map_id} value={map.map_id}>{map.name}{map.is_primary ? " · Hauptkarte" : ""}</option>)}
          </select>
          <button className="button ghost">Wechseln</button>
        </form> : null}
        <Link className="button primary" href={`/admin/projects/${projectId}/map/studio?mapId=${mapId}`}>Welt bearbeiten</Link>
        <Link className="button ghost" href={`/admin/projects/${projectId}/map/marker-editor?mapId=${mapId}`}>Marker bearbeiten</Link>
        <Link className="button ghost" href={`/admin/projects/${projectId}/map/maps`}>Alle Karten</Link>
      </div>
    </div>

    <section className="panel-card" style={{ marginBottom: 14 }}>
      <div className="table-meta">
        <span><strong>{layers.length}</strong> Kartenebenen</span>
        <span><strong>{features.length}</strong> Länder / Orte / Linien</span>
        <span><strong>{markers.length}</strong> Marker</span>
        <span>{selected.is_primary ? "Hauptkarte" : "Zusätzliche Karte"}</span>
      </div>
      <WorldMapViewer
        mapConfig={config}
        layers={layers}
        features={features}
        markers={markers}
        searchEndpoint={`/api/admin/projects/${projectId}/maps/${mapId}/search`}
        focusFeatureId={positive(search.featureId)}
        focusMarkerId={positive(search.markerId)}
      />
    </section>

    <section className="panel-card">
      <div className="panel-heading">
        <div><span className="panel-kicker">SCHNELLSTART</span><h2>Was möchtest du tun?</h2></div>
      </div>
      <div className="row wrap-row">
        <Link className="button primary" href={`/admin/projects/${projectId}/map/studio?mapId=${mapId}&tool=country`}>Land einzeichnen</Link>
        <Link className="button ghost" href={`/admin/projects/${projectId}/map/studio?mapId=${mapId}&tool=city`}>Stadt platzieren</Link>
        <Link className="button ghost" href={`/admin/projects/${projectId}/map/studio?mapId=${mapId}&tool=river`}>Fluss zeichnen</Link>
        <Link className="button ghost" href={`/admin/projects/${projectId}/locations`}>Locations</Link>
      </div>
    </section>
  </AdminShell>;
}
