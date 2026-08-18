import Link from "next/link";
import { PlayerShell } from "@/components/player-shell";
import { requirePlayerSession } from "@/lib/auth/player-session";
import { getPlayerContext, getPlayerHomeStats } from "@/lib/player-view";

export default async function PlayerHomePage() {
  const session = await requirePlayerSession();
  const [context, stats] = await Promise.all([
    getPlayerContext(session.projectId, session.playerId),
    getPlayerHomeStats(session.projectId, session.playerId),
  ]);

  if (!context) return null;

  return (
    <PlayerShell projectName={context.project_name} playerName={context.player_name}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Deine Sicht auf die Welt</span>
          <h1>Willkommen, {context.player_name}</h1>
          <p>Hier erscheinen ausschließlich Informationen, die für deinen Spielerzugang freigegeben wurden.</p>
        </div>
      </div>

      <section className="stats-grid">
        <Link href="/player/npcs" className="stat-card"><span>Bekannte NPCs</span><strong>{stats.npcs}</strong></Link>
        <div className="stat-card"><span>Bekannte Orte</span><strong>{stats.locations}</strong></div>
        <div className="stat-card"><span>Bekannte Gruppen</span><strong>{stats.groups}</strong></div>
        <div className="stat-card"><span>Bekannte Ereignisse</span><strong>{stats.events}</strong></div>
      </section>

      <section className="panel-card">
        <span className="eyebrow">Sichtbarkeit</span>
        <h2>Der Server filtert deine Welt</h2>
        <p>Verborgene Datensätze und Varianten anderer Spieler werden nicht an den Browser ausgeliefert. Freigaben und deine persönliche Version werden vor der Ausgabe auf dem Server angewendet.</p>
      </section>
    </PlayerShell>
  );
}
