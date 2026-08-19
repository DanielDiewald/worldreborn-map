import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { OpenLayersMapStudio } from "@/components/openlayers-map-studio";
import { requireAdminSession } from "@/lib/auth/session";
import { listMapFeatures, listMapLayers } from "@/lib/map-features";
import { listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";

export default async function MapStudioPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Promise<{mapId?:string}>}){
  await requireAdminSession();
  const [raw,search]=await Promise.all([params,searchParams]);
  const projectId=Number.parseInt(raw.projectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const [project,maps]=await Promise.all([getProject(projectId),listProjectMaps(projectId)]);if(!project)notFound();
  const requested=search.mapId?Number.parseInt(search.mapId,10):null;
  const selected=maps.find(map=>Number(map.map_id)===requested)??maps.find(map=>map.is_primary)??maps[0];if(!selected)notFound();
  const [layers,features]=await Promise.all([listMapLayers(projectId,Number(selected.map_id)),listMapFeatures(projectId,Number(selected.map_id))]);
  const config={mapId:Number(selected.map_id),mapType:selected.map_type as "tile"|"image",tileUrl:selected.tile_url,imagePath:selected.image_path,minZoom:selected.min_zoom,maxZoom:selected.max_zoom,centerLat:selected.center_lat,centerLng:selected.center_lng,bounds:selected.bounds,config:selected.config};
  return <AdminShell projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Map`} title={`${selected.name} · Studio`}>
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><Link href={`/admin/projects/${projectId}/map?mapId=${selected.map_id}`}>Map</Link><span>/</span><strong>Vector Studio</strong></div><h1>Länder, Regionen, Straßen & Flüsse</h1><p>OpenLayers-Editor für Punkte, Linien und Polygone. Die Geometrien werden projekt- und kartenbezogen in PostgreSQL gespeichert.</p></div><div className="row wrap-row">{maps.length>1?<form method="get" className="row"><select name="mapId" defaultValue={String(selected.map_id)}>{maps.map(map=><option key={map.map_id} value={map.map_id}>{map.name}</option>)}</select><button className="button ghost">Öffnen</button></form>:null}<Link className="button ghost" href={`/admin/projects/${projectId}/map?mapId=${selected.map_id}`}>Marker-Ansicht</Link><Link className="button ghost" href={`/admin/projects/${projectId}/settings`}>Layer Settings</Link></div></div>
    <section className="panel-card"><div className="table-meta"><span><strong>{layers.length}</strong> Layer</span><span><strong>{features.length}</strong> Vector-Features</span><span>Polygon = Land/Region · Linie = Straße/Fluss · Punkt = Stadt/POI</span></div><OpenLayersMapStudio projectId={projectId} mapConfig={config} layers={layers} features={features}/></section>
  </AdminShell>;
}
