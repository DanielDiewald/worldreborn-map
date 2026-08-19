import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { WorldMapViewer } from "@/components/map/world-map-viewer";
import mapStyles from "@/components/map/map-workspace.module.css";
import { requireAdminSession } from "@/lib/auth/session";
import { listMapFeatures, listMapLayers } from "@/lib/map-features";
import { listMapMarkers, listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";

function positive(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function AdminMapPage({ params, searchParams }: {
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
      <section className="panel-card empty-state large"><strong>Noch keine Karte vorhanden</strong><span>Erstelle deine Weltkarte direkt aus einer Rock-3-ZIP.</span><Link className="button primary" href={`/admin/projects/${projectId}/settings`}>Weltkarte erstellen</Link></section>
    </AdminShell>;
  }

  const mapId = Number(selected.map_id);
  const [markers, layers, features] = await Promise.all([listMapMarkers(projectId, mapId), listMapLayers(projectId, mapId), listMapFeatures(projectId, mapId)]);
  const config = { mapId, mapType: selected.map_type as "tile" | "image", tileUrl: selected.tile_url, imagePath: selected.image_path, minZoom: selected.min_zoom, maxZoom: selected.max_zoom, centerLat: selected.center_lat, centerLng: selected.center_lng, bounds: selected.bounds, config: selected.config };

  return <AdminShell immersive projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Karte`} title={selected.name}>
    <div className={mapStyles.routeShell}>
      <header className={mapStyles.routeToolbar}>
        <div className={mapStyles.routeIdentity}>
          <Link href={`/admin/projects/${projectId}`} className={`button ${mapStyles.backButton}`} aria-label="Zum Dashboard" title="Zum Dashboard">←</Link>
          <div className={mapStyles.routeTitle}><strong>{selected.name}</strong><span>{selected.is_primary ? "Hauptkarte" : "Zusätzliche Karte"} · {layers.length} Ebenen · {features.length} Kartenobjekte</span></div>
        </div>
        <div className={mapStyles.routeActions}>
          {maps.length > 1 ? <form method="get" className="row" style={{ gap: 5 }}><select className={mapStyles.mapSelect} name="mapId" defaultValue={String(mapId)} aria-label="Karte auswählen">{maps.map((map) => <option key={map.map_id} value={map.map_id}>{map.name}{map.is_primary ? " · Hauptkarte" : ""}</option>)}</select><button className={`${mapStyles.toolbarButton} button ghost`} aria-label="Gewählte Karte öffnen">Öffnen</button></form> : null}
          <div className={mapStyles.toolbarStats}><span className={mapStyles.statChip}><strong>{features.length}</strong> Objekte</span><span className={mapStyles.statChip}><strong>{markers.length}</strong> Marker</span></div>
          <Link className={`button ${mapStyles.toolbarButton} ${mapStyles.toolbarPrimary}`} href={`/admin/projects/${projectId}/map/studio?mapId=${mapId}`}>✎ Bearbeiten</Link>
          <Link className={`button ghost ${mapStyles.toolbarButton} ${mapStyles.secondaryMobileHide}`} href={`/admin/projects/${projectId}/map/marker-editor?mapId=${mapId}`}>⌖ Marker</Link>
          <Link className={`button ghost ${mapStyles.toolbarButton} ${mapStyles.secondaryMobileHide}`} href={`/admin/projects/${projectId}/map/maps`}>Alle Karten</Link>
        </div>
      </header>
      <WorldMapViewer mapConfig={config} layers={layers} features={features} markers={markers} searchEndpoint={`/api/admin/projects/${projectId}/maps/${mapId}/search`} focusFeatureId={positive(search.featureId)} focusMarkerId={positive(search.markerId)} height="100%"/>
    </div>
  </AdminShell>;
}
