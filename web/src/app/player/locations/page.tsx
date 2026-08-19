import Link from "next/link";
import { PlayerShell } from "@/components/player-shell";
import { requirePlayerSession } from "@/lib/auth/player-session";
import { locationKindLabel } from "@/lib/location-presentation";
import { getPlayerContext } from "@/lib/player-view";
import { listVisibleLocations } from "@/lib/player-world";

export default async function PlayerLocationsPage(){
  const session=await requirePlayerSession();
  const [context,locations]=await Promise.all([getPlayerContext(session.projectId,session.playerId),listVisibleLocations(session.projectId,session.playerId)]);
  if(!context)return null;
  return <PlayerShell projectName={context.project_name} playerName={context.player_name}>
    <div className="page-heading compact-heading"><div><span className="eyebrow">Welt / Orte</span><h1>Bekannte Orte</h1><p>Orte und Grenzen erscheinen nur, soweit sie für deinen Wissensstand freigegeben sind.</p></div><Link className="button primary" href="/player/map">Weltkarte öffnen</Link></div>
    {locations.length===0?<section className="panel-card empty-state large"><strong>Noch keine bekannten Orte</strong></section>:<section className="entity-card-grid">{locations.map((location)=><article className="panel-card" key={location.id}><span className="soft-label">{locationKindLabel(location.location_kind)}</span><h2>{location.name}</h2>{location.parent_name?<small className="muted">{location.parent_name} › {location.name}</small>:null}<p>{location.description||"Keine weiteren bekannten Informationen."}</p>{location.population?<small>Bevölkerung: {location.population}</small>:null}<div className="row wrap-row" style={{marginTop:10}}>{location.map_id&&location.map_feature_id?<Link className="button primary" href={`/player/map?mapId=${location.map_id}&featureId=${location.map_feature_id}`}>Auf Karte anzeigen</Link>:null}</div></article>)}</section>}
  </PlayerShell>;
}
