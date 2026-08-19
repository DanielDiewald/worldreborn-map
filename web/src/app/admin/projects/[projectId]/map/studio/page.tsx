import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { LandMaskPrecisionControl } from "@/components/map/land-mask-precision-control";
import { MapEditor } from "@/components/map/map-editor";
import mapStyles from "@/components/map/map-workspace.module.css";
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
  const placementLocation=existingLocation&&!existingLocation.map_feature_id?{id:existingLocation.loc_id,name:existingLocation.name,kind:existingLocation.location_kind,parentId:existingLocation.parent_loc_id}:null;
  const initialTool=placementLocation?toolForKind(placementLocation.kind):(search.tool??null);
  const editorKey=[mapId,focusFeatureId??0,placementLocation?.id??0,initialTool??""].join(":");

  return <AdminShell immersive projectId={projectId} projectName={project.name} section="map" eyebrow={`${project.name} / Karte`} title={`${selected.name} · Bearbeiten`}>
    <div className={mapStyles.routeShell}>
      <header className={mapStyles.routeToolbar}>
        <div className={mapStyles.routeIdentity}>
          <Link href={`/admin/projects/${projectId}/map?mapId=${mapId}${focusFeatureId?`&featureId=${focusFeatureId}`:""}`} className={mapStyles.backButton} aria-label="Zur Kartenansicht" title="Zur Kartenansicht">←</Link>
          <div className={mapStyles.routeTitle}><strong>{placementLocation?`${placementLocation.name} platzieren`:`${selected.name} bearbeiten`}</strong><span>{placementLocation?"Bestehende Location mit Karten-Geometrie verknüpfen":isRock3?"Weltkarte · Rock-3-Daten verbunden":"Karteneditor"}</span></div>
        </div>
        <div className={mapStyles.routeActions}>
          {maps.length>1&&(!existingLocation||placementLocation)?<form method="get" className="row" style={{gap:5}}>{placementLocation?<input type="hidden" name="locationId" value={placementLocation.id}/>:null}{!placementLocation&&search.tool?<input type="hidden" name="tool" value={search.tool}/>:null}<select className={mapStyles.mapSelect} name="mapId" defaultValue={String(mapId)} aria-label={placementLocation?"Zielkarte auswählen":"Karte wechseln"}>{maps.map(map=><option key={map.map_id} value={map.map_id}>{map.name}{map.is_primary?" · Hauptkarte":""}</option>)}</select><button className={`${mapStyles.toolbarButton} button ghost`}>Öffnen</button></form>:null}
          {existingLocation?<Link className={`${mapStyles.toolbarButton} button ghost ${mapStyles.secondaryMobileHide}`} href={`/admin/projects/${projectId}/locations/${existingLocation.loc_id}`}>Location</Link>:null}
          <Link className={`${mapStyles.toolbarButton} button ghost ${mapStyles.secondaryMobileHide}`} href={`/admin/projects/${projectId}/map/marker-editor?mapId=${mapId}`}>⌖ Marker</Link>
          {isRock3?<details style={{position:"relative"}}><summary className={`${mapStyles.toolbarButton} button ghost`} style={{listStyle:"none",cursor:"pointer"}}>⌁ Küste</summary><div className={mapStyles.glass} style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:250,padding:14,borderRadius:14,zIndex:80}}><LandMaskPrecisionControl/></div></details>:null}
          <details style={{position:"relative"}}><summary className={`${mapStyles.toolbarButton} button ghost`} style={{listStyle:"none",cursor:"pointer"}}>⋯ Weltdaten</summary><div className={mapStyles.glass} style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:"min(390px,calc(100vw - 100px))",maxHeight:"70vh",overflow:"auto",padding:14,borderRadius:14,zIndex:80}}><Rock3LayerImporter projectId={projectId} mapId={mapId}/></div></details>
        </div>
      </header>
      <div style={{position:"relative",minHeight:0}}>
        {!isRock3?<div className={mapStyles.errorToast} style={{top:14,bottom:"auto"}}>Noch keine Rock-3-Weltdaten verbunden. Zeichnen funktioniert trotzdem; über „Weltdaten“ kannst du eine ZIP verbinden.</div>:null}
        {existingLocation?.map_feature_id?<div className={mapStyles.successToast} style={{top:14,bottom:"auto"}}>„{existingLocation.name}“ ist bereits platziert. Die Geometrie ist ausgewählt und kann direkt bearbeitet werden.</div>:null}
        <MapEditor key={editorKey} projectId={projectId} mapConfig={config} layers={layers} features={features} initialTool={initialTool} focusFeatureId={focusFeatureId} existingLocation={placementLocation} height="100%"/>
      </div>
    </div>
  </AdminShell>;
}
