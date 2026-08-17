import { PlayerShell } from "@/components/player-shell";
import { requirePlayerSession } from "@/lib/auth/player-session";
import { getPlayerContext, listVisibleNpcsForPlayer } from "@/lib/player-view";

export default async function PlayerNpcsPage() {
  const session = await requirePlayerSession();
  const [context, npcs] = await Promise.all([
    getPlayerContext(session.projectId, session.playerId),
    listVisibleNpcsForPlayer(session.projectId, session.playerId),
  ]);

  if (!context) return null;

  return (
    <PlayerShell projectName={context.project_name} playerName={context.player_name}>
      <div className="page-heading compact-heading">
        <div>
          <span className="eyebrow">World / NPCs</span>
          <h1>Bekannte Personen</h1>
          <p>Dein persönlicher Wissensstand in {context.project_name}.</p>
        </div>
      </div>
      <section className="entity-card-grid">
        {npcs.length === 0 ? (
          <div className="panel-card empty-state large"><strong>Noch keine bekannten NPCs</strong><span>Neue Informationen erscheinen hier, sobald die Spielleitung sie freigibt.</span></div>
        ) : npcs.map((npc) => (
          <article className="panel-card" key={npc.id}>
            <div className="entity-cell">
              <span className="entity-avatar">
                {npc.image && npc.image !== "noimage" ? <img src={npc.image} alt="" /> : npc.name.slice(0, 1).toUpperCase()}
              </span>
              <span><strong>{npc.name}</strong><small>{npc.title ?? "NPC"}</small></span>
            </div>
            {npc.description ? <p>{npc.description}</p> : <p className="muted">Zu dieser Person sind dir noch keine weiteren Informationen bekannt.</p>}
          </article>
        ))}
      </section>
    </PlayerShell>
  );
}
