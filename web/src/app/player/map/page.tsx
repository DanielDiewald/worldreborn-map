import Link from "next/link";
import { WorldMapViewer } from "@/components/map/world-map-viewer";
import mapStyles from "@/components/map/map-workspace.module.css";
import { PlayerShell } from "@/components/player-shell";
import { requirePlayerSession } from "@/lib/auth/player-session";
import { listVisibleMapFeatures, listVisibleMapLayers } from "@/lib/map-features";
import { getVisibleMapMarkers } from "@/lib/maps";
import { getPlayerContext } from "@/lib/player-view";
import { listVisibleMaps } from "@/lib/player-world";

function positive(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export default async function PlayerMapPage({searchParams}:{searchParams:Promise<{mapId?:string;featureId?:string;markerId?:string}>}) {
  const session=await requirePlayerSession();
  const [context,maps,search]=await Promise.all([getPlayerContext(session.projectId,session.playerId),listVisibleMaps(session.projectId),searchParams]);
  if(!context)return null;
  const requested=positive(search.mapId),selected=maps.find(map=>Number(map.map_id)===requested)??maps.find(map=>map.is_primary)??maps[0];
  if(!selected)return <PlayerShell projectName={context.project_name} playerName={context.player_name}><section className="panel-card empty-state large"><strong>Keine Karte verfügbar</strong></section></PlayerShell>;

  const mapId=Number(selected.map_id);
  const [markers,layers,features]=await Promise.all([getVisibleMapMarkers(session.projectId,mapId,session.playerId),listVisibleMapLayers(session.projectId,mapId,session.playerId),listVisibleMapFeatures(session.projectId,mapId,session.playerId)]);
  const config={mapId,mapType:selected.map_type as "tile"|"image",tileUrl:selected.tile_url,imagePath:selected.image_path,minZoom:selected.min_zoom,maxZoom:selected.max_zoom,centerLat:selected.center_lat,centerLng:selected.center_lng,bounds:selected.bounds,config:selected.config};

  return <PlayerShell immersive projectName={context.project_name} playerName={context.player_name}>
    <div className={mapStyles.routeShell}>
      <header className={mapStyles.routeToolbar}>
        <div className={mapStyles.routeIdentity}><Link href="/player/home" className={mapStyles.backButton} aria-label="Zur Übersicht">←</Link><div className={mapStyles.routeTitle}><strong>{selected.name}</strong><span>{selected.is_primary?"Hauptkarte":"Karte"} · nur dein freigegebener Wissensstand</span></div></div>
        <div className={mapStyles.routeActions}>{maps.length>1?<div className="row" style={{gap:4}}>{maps.map(map=><Link key={map.map_id} className={`${mapStyles.toolbarButton} ${Number(map.map_id)===mapId?mapStyles.toolbarPrimary:"button ghost"}`} href={`/player/map?mapId=${map.map_id}`}>{map.name}</Link>)}</div>:null}</div>
      </header>
      <WorldMapViewer mapConfig={config} layers={layers} features={features} markers={markers} searchEndpoint={`/api/player/maps/${mapId}/search`} focusFeatureId={positive(search.featureId)} focusMarkerId={positive(search.markerId)} height="100%"/>
    </div>
  </PlayerShell>;
}
