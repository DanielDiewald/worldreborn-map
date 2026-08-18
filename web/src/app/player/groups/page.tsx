import { PlayerShell } from "@/components/player-shell";
import { requirePlayerSession } from "@/lib/auth/player-session";
import { getPlayerContext } from "@/lib/player-view";
import { listVisibleGroups } from "@/lib/player-world";

export default async function PlayerGroupsPage(){const session=await requirePlayerSession();const [context,groups]=await Promise.all([getPlayerContext(session.projectId,session.playerId),listVisibleGroups(session.projectId,session.playerId)]);if(!context)return null;return <PlayerShell projectName={context.project_name} playerName={context.player_name}><div className="page-heading compact-heading"><div><span className="eyebrow">World / Groups</span><h1>Bekannte Gruppen</h1></div></div><section className="entity-card-grid">{groups.map((group)=><article className="panel-card" key={group.id}><span className="soft-label">{group.group_type||"Gruppe"}</span><h2>{group.name}</h2><p>{group.notes}</p><small>{group.motto&&group.motto!=="unknown"?`„${group.motto}“ · `:""}{group.location_name?`Hauptquartier: ${group.location_name}`:""}</small></article>)}</section></PlayerShell>;}
