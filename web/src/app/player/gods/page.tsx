import { PlayerShell } from "@/components/player-shell";
import { requirePlayerSession } from "@/lib/auth/player-session";
import { getPlayerContext } from "@/lib/player-view";
import { listVisibleGods } from "@/lib/player-world";

export default async function PlayerGodsPage(){const session=await requirePlayerSession();const [context,gods]=await Promise.all([getPlayerContext(session.projectId,session.playerId),listVisibleGods(session.projectId,session.playerId)]);if(!context)return null;return <PlayerShell projectName={context.project_name} playerName={context.player_name}><div className="page-heading compact-heading"><div><span className="eyebrow">World / Gods</span><h1>Bekannte Gottheiten</h1></div></div><section className="entity-card-grid">{gods.map((god)=><article className="panel-card" key={god.id}><div className="entity-cell"><span className="entity-avatar">{god.image&&god.image!=="noimage"?<img src={god.image} alt=""/>:god.name.slice(0,1)}</span><span><strong>{god.name}</strong><small>{god.title} · {god.domain}</small></span></div><p>{god.description||"Keine weiteren bekannten Informationen."}</p></article>)}</section></PlayerShell>;}
