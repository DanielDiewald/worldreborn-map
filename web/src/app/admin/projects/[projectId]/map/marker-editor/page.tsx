import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { MapViewer } from "@/components/map-viewer";
import { requireAdminSession } from "@/lib/auth/session";
import { listMapMarkers, listProjectMapPlayers, listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";

export default async function MarkerEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ mapId?: string }>;
}) {
  await requireAdminSession();
  const [raw, search] = await Promise.all([params, searchParams]);
  const projectId = Number.parseInt(raw.projectId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();

  const [project, maps, players] = await Promise.all([
    getProject(projectId),
    listProjectMaps(projectId),
    listProjectMapPlayers(projectId),
  ]);
  if (!project) notFound();

  const requested = search.mapId ? Number.parseInt(search.mapId, 10) : null;
  const selected = maps.find((map) => Number(map.map_id) === requested) ?? maps.find((map) => map.is_primary) ?? maps[0];
  if (!selected) notFound();

  const markers = await listMapMarkers(projectId, Number(selected.map_id));
  const config = {
    mapId: Number(selected.map_id),
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

  return <AdminShell projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Karte`} title={`${selected.name} · Marker`}>
    <div className="page-heading compact-heading">
      <div>
        <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/map?mapId=${selected.map_id}`}>{selected.name}</Link><span>/</span><strong>Marker bearbeiten</strong></div>
        <h1>Marker bearbeiten</h1>
        <p>Bestehender Marker-Editor für freie Marker und Legacy-Koordinaten. Länder, Städte und Locations werden im neuen Karteneditor bearbeitet.</p>
      </div>
      <div className="row wrap-row">
        <Link className="button primary" href={`/admin/projects/${projectId}/map?mapId=${selected.map_id}`}>Zur Kartenansicht</Link>
        <Link className="button ghost" href={`/admin/projects/${projectId}/map/studio?mapId=${selected.map_id}`}>Länder & Orte bearbeiten</Link>
      </div>
    </div>
    <section className="notice warning" style={{ marginBottom: 14 }}>
      <strong>Legacy-Markerwerkzeug</strong>
      <div>Dieser Bereich bleibt während der OpenLayers-Migration erhalten, damit vorhandene X/Y- und Lat/Lng-Marker ohne Koordinatenänderung weiter bearbeitet werden können.</div>
    </section>
    <section className="panel-card">
      <MapViewer key={config.mapId} mapConfig={config} initialMarkers={markers} admin projectId={projectId} players={players} />
    </section>
  </AdminShell>;
}
