import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { PoliticalBorderWorkbench } from "@/components/map/political-border-workbench";
import mapStyles from "@/components/map/map-workspace.module.css";
import { requireAdminSession } from "@/lib/auth/session";
import { listMapFeatures, listMapLayers } from "@/lib/map-features";
import { listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";

function positive(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function PoliticalBordersPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ mapId?: string }>;
}) {
  await requireAdminSession();
  const [raw, search] = await Promise.all([params, searchParams]);
  const projectId = Number.parseInt(raw.projectId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();

  const [project, maps] = await Promise.all([getProject(projectId), listProjectMaps(projectId)]);
  if (!project) notFound();
  const requestedMapId = positive(search.mapId);
  const selected = maps.find((map) => Number(map.map_id) === requestedMapId) ?? maps.find((map) => map.is_primary) ?? maps[0];
  if (!selected) notFound();
  const mapId = Number(selected.map_id);
  const [features, layers] = await Promise.all([listMapFeatures(projectId, mapId), listMapLayers(projectId, mapId)]);
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

  return <AdminShell immersive projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Karte`} title={`${selected.name} · Grenzen`}>
    <div className={mapStyles.routeShell}>
      <header className={mapStyles.routeToolbar}>
        <div className={mapStyles.routeIdentity}>
          <Link href={`/admin/projects/${projectId}/map/studio?mapId=${mapId}`} className={mapStyles.backButton} aria-label="Zurück zum Karteneditor" title="Zurück zum Karteneditor">←</Link>
          <div className={mapStyles.routeTitle}><strong>Politische Grenzen</strong><span>Grenzen formen und neue Länder automatisch an bestehende Flächen anpassen</span></div>
        </div>
        <div className={mapStyles.routeActions}>
          {maps.length > 1 ? <form method="get" className="row" style={{ gap: 5 }}><select className={mapStyles.mapSelect} name="mapId" defaultValue={String(mapId)} aria-label="Karte wechseln">{maps.map((map) => <option key={map.map_id} value={map.map_id}>{map.name}{map.is_primary ? " · Hauptkarte" : ""}</option>)}</select><button className={`${mapStyles.toolbarButton} button ghost`}>Öffnen</button></form> : null}
          <Link className={`${mapStyles.toolbarButton} button ghost`} href={`/admin/projects/${projectId}/map/studio?mapId=${mapId}`}>✎ Editor</Link>
          <Link className={`${mapStyles.toolbarButton} button ghost`} href={`/admin/projects/${projectId}/map?mapId=${mapId}`}>Kartenansicht</Link>
        </div>
      </header>
      <div style={{ position: "relative", minHeight: 0 }}>
        <PoliticalBorderWorkbench projectId={projectId} mapConfig={config} layers={layers} features={features} height="100%"/>
      </div>
    </div>
  </AdminShell>;
}
