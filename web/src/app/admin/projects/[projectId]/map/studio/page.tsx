import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { MapEditor } from "@/components/map/map-editor";
import { Rock3LayerImporter } from "@/components/rock3-layer-importer";
import { requireAdminSession } from "@/lib/auth/session";
import { listMapFeatures, listMapLayers } from "@/lib/map-features";
import { listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";

function positive(value:string|undefined){const parsed=Number.parseInt(value??"",10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;}

export default async function MapStudioPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Promise<{mapId?:string;tool?:string;featureId?:string}>}){
  await requireAdminSession();const [raw,search]=await Promise.all([params,searchParams]);const projectId=Number.parseInt(raw.projectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const [project,maps]=await Promise.all([getProject(projectId),listProjectMaps(projectId)]);if(!project)notFound();const requested=positive(search.mapId);const selected=maps.find(map=>Number(map.map_id)===requested)??maps.find(map=>map.is_primary)??maps[0];if(!selected)notFound();
  const mapId=Number(selected.map_id);const [layers,features]=await Promise.all([listMapLayers(projectId,mapId),listMapFeatures(projectId,mapId)]);const config={mapId,mapType:selected.map_type as "tile"|"image",tileUrl:selected.tile_url,imagePath:selected.image_path,minZoom:selected.min_zoom,maxZoom:selected.max_zoom,centerLat:selected.center_lat,centerLng:selected.center_lng,bounds:selected.bounds,config:selected.config};const isRock3=Boolean((selected.config as Record<string,unknown>|null)?.rock3);
  return <AdminShell projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Karte`} title={`${selected.name} · Bearbeiten`}>
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><Link href={`/admin/projects/${projectId}/map?mapId=${mapId}`}>{selected.name}</Link><span>/</span><strong>Bearbeiten</strong></div><h1>Welt bearbeiten</h1><p>Arbeite mit Ländern, Regionen, Städten, Flüssen und Straßen – WorldReborn kümmert sich um die technischen Geometrien und Ebenen.</p></div><div className="row wrap-row">{maps.length>1?<form method="get" className="row"><select name="mapId" defaultValue={String(mapId)} aria-label="Karte wechseln">{maps.map(map=><option key={map.map_id} value={map.map_id}>{map.name}</option>)}</select><button className="button ghost">Wechseln</button></form>:null}<Link className="button primary" href={`/admin/projects/${projectId}/map?mapId=${mapId}`}>Kartenansicht</Link><Link className="button ghost" href={`/admin/projects/${projectId}/map/marker-editor?mapId=${mapId}`}>Marker</Link></div></div>
    {!isRock3?<section className="notice warning" style={{marginBottom:12}}><strong>Noch keine Rock-3-Weltdaten verbunden.</strong><div>Du kannst trotzdem zeichnen oder unten eine Rock-3-ZIP mit dieser Karte verbinden.</div></section>:null}
    <section className="panel-card" style={{padding:10}}><MapEditor projectId={projectId} mapConfig={config} layers={layers} features={features} initialTool={search.tool??null} focusFeatureId={positive(search.featureId)}/></section>
    <details className="panel-card" style={{marginTop:12}}><summary style={{cursor:"pointer",fontWeight:600}}>{isRock3?"Rock-3-Weltdaten aktualisieren":"Rock-3-ZIP verbinden"}</summary><div style={{paddingTop:12}}><Rock3LayerImporter projectId={projectId} mapId={mapId}/></div></details>
  </AdminShell>;
}
