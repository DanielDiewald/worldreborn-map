import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { PlayerCodeControl } from "@/components/admin/player-code-control";
import { requireAdminSession } from "@/lib/auth/session";
import { listPlayers } from "@/lib/players";
import { getProject } from "@/lib/projects";
import {
  createPlayerAction,
  revokePlayerCodeAction,
  togglePlayerAction,
} from "./actions";

export default async function PlayersPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireAdminSession();
  const { projectId: rawProjectId } = await params;
  const projectId = Number.parseInt(rawProjectId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();

  const [project, players] = await Promise.all([getProject(projectId), listPlayers(projectId)]);
  if (!project) notFound();
  const createAction = createPlayerAction.bind(null, projectId);

  return (
    <AdminShell projectId={projectId} projectName={project.name} section="players" eyebrow={`${project.name} / Players`} title="Players">
      <div className="page-heading compact-heading">
        <div>
          <div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Players</strong></div>
          <h1>Spielerzugänge</h1>
          <p>Spieler anlegen, Zugriffscodes rotieren und aktive Sitzungen zentral widerrufen.</p>
        </div>
        <details className="create-dropdown">
          <summary className="button primary">＋ Spieler erstellen</summary>
          <div className="create-popover">
            <div className="popover-heading"><strong>Spieler erstellen</strong><span>Der Zugangscode wird anschließend separat generiert.</span></div>
            <form action={createAction} className="stack">
              <label>Spielername<input name="name" maxLength={120} required /></label>
              <label>Anzeigename<input name="displayName" maxLength={120} /></label>
              <div className="row end"><button className="primary" type="submit">Spieler anlegen</button></div>
            </form>
          </div>
        </details>
      </div>

      <section className="panel-card">
        <div className="table-meta"><span><strong>{players.length}</strong> Spieler</span><span>Codes werden ausschließlich gehasht gespeichert.</span></div>
        {players.length === 0 ? (
          <div className="empty-state large"><strong>Noch keine Spieler</strong><span>Lege den ersten Spieler für dieses Projekt an.</span></div>
        ) : (
          <div className="table-scroll">
            <table className="entity-table">
              <thead><tr><th>Spieler</th><th>Status</th><th>Code</th><th>Letzte Nutzung</th><th>Aktionen</th></tr></thead>
              <tbody>
                {players.map((player) => {
                  const revokeAction = revokePlayerCodeAction.bind(null, projectId, player.userId);
                  const toggleAction = togglePlayerAction.bind(null, projectId, player.userId, !player.active);
                  return (
                    <tr key={player.userId}>
                      <td><strong>{player.displayName}</strong><br /><small className="muted">{player.name} · #{player.userId}</small></td>
                      <td><span className={`visibility-pill ${player.active ? "all_players" : "admin_only"}`}>{player.active ? "Aktiv" : "Deaktiviert"}</span></td>
                      <td>{player.codePrefix ? <><code>{player.codePrefix}…</code>{player.revokedAt ? <small className="muted"> · widerrufen</small> : null}</> : <span className="muted">Kein Code</span>}</td>
                      <td>{player.lastUsedAt ? player.lastUsedAt.toLocaleString("de-DE") : <span className="muted">Nie</span>}</td>
                      <td>
                        <div className="stack compact-stack">
                          {player.active ? <PlayerCodeControl projectId={projectId} playerId={player.userId} /> : null}
                          {player.codePrefix && !player.revokedAt ? <form action={revokeAction}><button className="button ghost" type="submit">Code widerrufen</button></form> : null}
                          <form action={toggleAction}><button className="button ghost" type="submit">{player.active ? "Spieler deaktivieren" : "Spieler aktivieren"}</button></form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
