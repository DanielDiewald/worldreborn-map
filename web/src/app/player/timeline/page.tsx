import { PlayerShell } from "@/components/player-shell";
import { requirePlayerSession } from "@/lib/auth/player-session";
import { getVisibleTimelineEvents } from "@/lib/entities/timeline";
import { getPlayerContext } from "@/lib/player-view";

export default async function PlayerTimelinePage(){const session=await requirePlayerSession();const [context,events]=await Promise.all([getPlayerContext(session.projectId,session.playerId),getVisibleTimelineEvents(session.projectId,session.playerId)]);if(!context)return null;return <PlayerShell projectName={context.project_name} playerName={context.player_name}><div className="page-heading compact-heading"><div><span className="eyebrow">World / Timeline</span><h1>Bekannte Geschichte</h1></div></div><section className="timeline-list">{events.map((event)=><article className="panel-card" key={event.e_id}><div className="row"><span className="soft-label">{event.display_date||"Unbekannt"}</span><span className="soft-label">{event.category||"Event"}</span></div><h2>{event.name}</h2><p>{event.notes}</p>{event.location_name?<small>Ort: {event.location_name}</small>:null}</article>)}</section></PlayerShell>;}
