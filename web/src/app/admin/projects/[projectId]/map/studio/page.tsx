import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { MapEditor } from "@/components/map/map-editor";
import { Rock3LayerImporter } from "@/components/rock3-layer-importer";
import { requireAdminSession } from "@/lib/auth/session";
import { getLocation, type LocationKind } from "@/lib/entities/locations";
import { listMapFeatures, listMapLayers } from "@/lib/map-features";
import { listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";

function positive(value:string|undefined){const parsed=Number.parseInt(value??"",10);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;}
function toolForKind(kind:LocationKind){if(kind==="country")return"country";if(kind==="province")return"province";if(kind==="region")return"region";if(["city","town","village"].includes(kind))return"city";return"place";}

export default async function MapStudioPage({params,searchParams}:{params:Promise<{projectId:string}>;searchParams:Promise<{mapId?:string;tool?:string;featureId?:string;locationId?:string}>}){
  await requireAdminSession();
  const [raw,search]=await Promise.all([params,searchParams]);
  const projectId=Number.parseInt(raw.projectId,10);if(!Number.isSafeInteger(projectId)||projectId<=0)notFound();
  const requestedLocationId=positive(search.locationId);
  const [project,maps,existingLocation]=await Promise.all([getProject(projectId),listProjectMaps(projectId),requestedLocationId?getLocation(projectId,requestedLocationId):Promise.resolve(null)]);
  if(!project)notFound();
  const requestedMapId=positive(search.mapId)??(existingLocation?.map_id?Number(existingLocation.map_id):null);
  const selected=maps.find(map=>Number(map.map_id)===requestedMapId)??maps.find(map=>map.is_primary)??maps[0];if(!selected)notFound();
  const mapId=Number(selected.map_id);
  const [layers,features]=await Promise.all([listMapLayers(projectId,mapId),listMapFeatures(projectId,mapId)]);
  const config={mapId,mapType:selected.map_type as "tile"|"image",tileUrl:selected.tile_url,imagePath:selected.image_path,minZoom:selected.min_zoom,maxZoom:selected.max_zoom,centerLat:selected.center_lat,centerLng:selected.center_lng,bounds:selected.bounds,config:selected.config};
  const isRock3=Boolean((selected.config as Record<string,unknown>|null)?.rock3);
  const focusFeatureId=positive(search.featureId)??(existingLocation?.map_feature_id?Number(existingLocation.map_feature_id):null);
  const placementLocation=existingLocation&&!existingLocation.map_feature_id?{id:existingLocation.loc_id,name:existingLocation.name,kind:existingLocation.location_kind}:null;
  const initialTool=placementLocation?toolForKind(placementLocation.kind):(search.tool??null);

  return <AdminShell projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Karte`} title={`${selected.name} · Bearbeiten`}>
    <div className="page-heading compact-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><Link href={`/admin/projects/${projectId}/map?mapId=${mapId}`}>{selected.name}</Link><span>/</span><strong>Bearbeiten</strong></div><h1>{placementLocation?`${placementLocation.name} platzieren`:"Welt bearbeiten"}</h1><p>{placementLocation?"Zeichne nur die Kartenposition oder Grenze. Die bestehende Location bleibt der kanonische Lore-Datensatz.":"Arbeite mit Ländern, Regionen, Städten, Flüssen und Straßen – WorldReborn kümmert sich um die technischen Geometrien und Ebenen."}</p></div><div className="row wrap-row">{maps.length>1&&!placementLocation?<form method="get" className="row"><select name="mapId" defaultValue={String(mapId)} aria-label="Karte wechseln">{maps.map(map=><option key={map.map_id} value={map.map_id}>{map.name}</option>)}</select><button className="button ghost">Wechseln</button></form>:null}<Link className="button primary" href={`/admin/projects/${projectId}/map?mapId=${mapId}${focusFeatureId?`&featureId=${focusFeatureId}`:""}`}>Kartenansicht</Link><Link className="button ghost" href={`/admin/projects/${projectId}/map/marker-editor?mapId=${mapId}`}>Marker</Link>{existingLocation?<Link className="button ghost" href={`/admin/projects/${projectId}/locations/${existingLocation.loc_id}`}>Zur Location</Link>:null}</div></div>
    {!isRock3?<section className="notice warning" style={{marginBottom:12}}><strong>Noch keine Rock-3-Weltdaten verbunden.</strong><div>Du kannst trotzdem zeichnen oder unten eine Rock-3-ZIP mit dieser Karte verbinden.</div></section>:null}
    {existingLocation?.map_feature_id?<section className="notice" style={{marginBottom:12}}><strong>{existingLocation.name} ist bereits auf einer Karte platziert.</strong><div>Die bestehende Geometrie wurde fokussiert. Ziehe ihre Punkte, um Grenze oder Position zu ändern.</div></section>:null}
    <section className="panel-card" style={{padding:10}}><MapEditor projectId={projectId} mapConfig={config} layers={layers} features={features} initialTool={initialTool} focusFeatureId={focusFeatureId} existingLocation={placementLocation}/></section>
    <details className="panel-card" style={{marginTop:12}}><summary style={{cursor:"pointer",fontWeight:600}}>{isRock3?"Rock-3-Weltdaten aktualisieren":"Rock-3-ZIP verbinden"}</summary><div style={{paddingTop:12}}><Rock3LayerImporter projectId={projectId} mapId={mapId}/></div></details>
  </AdminShell>;
}
