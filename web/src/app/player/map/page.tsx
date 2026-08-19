import Link from "next/link";
import { WorldMapViewer } from "@/components/map/world-map-viewer";
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
  const session = await requirePlayerSession();
  const [context,maps,search]=await Promise.all([getPlayerContext(session.projectId,session.playerId),listVisibleMaps(session.projectId),searchParams]);
  if(!context)return null;
  const requested=positive(search.mapId);const selected=maps.find(map=>Number(map.map_id)===requested)??maps.find(map=>map.is_primary)??maps[0];
  if(!selected)return <PlayerShell projectName={context.project_name} playerName={context.player_name}><section className="panel-card empty-state large"><strong>Keine Karte verfügbar</strong></section></PlayerShell>;

  const mapId=Number(selected.map_id);
  const [markers,layers,features]=await Promise.all([getVisibleMapMarkers(session.projectId,mapId,session.playerId),listVisibleMapLayers(session.projectId,mapId,session.playerId),listVisibleMapFeatures(session.projectId,mapId,session.playerId)]);
  const config={mapId,mapType:selected.map_type as "tile"|"image",tileUrl:selected.tile_url,imagePath:selected.image_path,minZoom:selected.min_zoom,maxZoom:selected.max_zoom,centerLat:selected.center_lat,centerLng:selected.center_lng,bounds:selected.bounds,config:selected.config};

  return <PlayerShell projectName={context.project_name} playerName={context.player_name}>
    <div className="page-heading compact-heading"><div><span className="eyebrow">Welt / Karte</span><h1>{selected.name}</h1><p>Suche nach bekannten Orten und Personen. Grenzen, Ebenen und Marker erscheinen nur entsprechend deinem Wissensstand.</p></div>{maps.length>1?<div className="row wrap-row">{maps.map(map=><Link className={Number(map.map_id)===mapId?"button primary":"button ghost"} key={map.map_id} href={`/player/map?mapId=${map.map_id}`}>{map.name}</Link>)}</div>:null}</div>
    <section className="panel-card"><WorldMapViewer mapConfig={config} layers={layers} features={features} markers={markers} searchEndpoint={`/api/player/maps/${mapId}/search`} focusFeatureId={positive(search.featureId)} focusMarkerId={positive(search.markerId)}/></section>
  </PlayerShell>;
}
