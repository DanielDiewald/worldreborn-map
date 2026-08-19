import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { MapViewer } from "@/components/map-viewer";
import mapStyles from "@/components/map/map-workspace.module.css";
import { requireAdminSession } from "@/lib/auth/session";
import { listMapMarkers, listProjectMapPlayers, listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";

export default async function MarkerEditorPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ mapId?: string }> }) {
  await requireAdminSession();
  const [raw, search] = await Promise.all([params, searchParams]);
  const projectId = Number.parseInt(raw.projectId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();

  const [project, maps, players] = await Promise.all([getProject(projectId), listProjectMaps(projectId), listProjectMapPlayers(projectId)]);
  if (!project) notFound();
  const requested = search.mapId ? Number.parseInt(search.mapId, 10) : null;
  const selected = maps.find((map) => Number(map.map_id) === requested) ?? maps.find((map) => map.is_primary) ?? maps[0];
  if (!selected) notFound();

  const markers = await listMapMarkers(projectId, Number(selected.map_id));
  const config = { mapId: Number(selected.map_id), mapType: selected.map_type as "tile" | "image", tileUrl: selected.tile_url, imagePath: selected.image_path, minZoom: selected.min_zoom, maxZoom: selected.max_zoom, centerLat: selected.center_lat, centerLng: selected.center_lng, bounds: selected.bounds, config: selected.config };

  return <AdminShell immersive projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Karte`} title={`${selected.name} · Marker`}>
    <div className={mapStyles.routeShell}>
      <header className={mapStyles.routeToolbar}>
        <div className={mapStyles.routeIdentity}><Link href={`/admin/projects/${projectId}/map?mapId=${selected.map_id}`} className={mapStyles.backButton} aria-label="Zur Kartenansicht">←</Link><div className={mapStyles.routeTitle}><strong>Marker · {selected.name}</strong><span>Legacy-Koordinateneditor · {markers.length} Marker</span></div></div>
        <div className={mapStyles.routeActions}>{maps.length > 1 ? <form method="get" className="row" style={{gap:5}}><select className={mapStyles.mapSelect} name="mapId" defaultValue={String(selected.map_id)}>{maps.map((map)=><option key={map.map_id} value={map.map_id}>{map.name}</option>)}</select><button className={`${mapStyles.toolbarButton} button ghost`}>Öffnen</button></form>:null}<Link className={`${mapStyles.toolbarButton} ${mapStyles.toolbarPrimary}`} href={`/admin/projects/${projectId}/map/studio?mapId=${selected.map_id}`}>✎ Länder & Orte</Link></div>
      </header>
      <div style={{overflow:"auto",padding:12,minHeight:0}}><MapViewer key={config.mapId} mapConfig={config} initialMarkers={markers} admin projectId={projectId} players={players}/></div>
    </div>
  </AdminShell>;
}
