import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { listPlayerEntityAccess } from "@/lib/entity-visibility";
import { getNpc } from "@/lib/entities/npcs";
import { getProject } from "@/lib/projects";
import {
  deleteNpcVariantAction,
  saveNpcVariantAction,
  setNpcVisibilityAction,
} from "./actions";

export default async function NpcVisibilityPage({ params }: { params: Promise<{ projectId: string; npcId: string }> }) {
  await requireAdminSession();
  const raw = await params;
  const projectId = Number.parseInt(raw.projectId, 10);
  const npcId = Number.parseInt(raw.npcId, 10);
  if (!Number.isSafeInteger(projectId) || !Number.isSafeInteger(npcId) || projectId <= 0 || npcId <= 0) notFound();

  const [project, npc] = await Promise.all([getProject(projectId), getNpc(projectId, npcId)]);
  if (!project || !npc) notFound();

  const access = await listPlayerEntityAccess({
    projectId,
    entityType: "npc",
    entityId: npcId,
    baseVisibility: npc.visibilityMode,
  });

  return (
    <AdminShell projectId={projectId} projectName={project.name} section="npcs" eyebrow={`${project.name} / NPCs / Wissen`} title={`${npc.name} · Spieler-Sichtbarkeit`}>
      <div className="page-heading compact-heading">
        <div>
          <div className="breadcrumb"><Link href={`/admin/projects/${projectId}/npcs/${npcId}`}>{npc.name}</Link><span>/</span><strong>Spieler-Sichtbarkeit</strong></div>
          <h1>Wer kennt welche Version?</h1>
          <p>Freigaben und Schein-Einträge werden serverseitig angewendet. Ein Spieler erhält niemals die Variante eines anderen Spielers.</p>
        </div>
        <Link className="button ghost" href={`/admin/projects/${projectId}/npcs/${npcId}`}>← NPC öffnen</Link>
      </div>

      <section className="panel-card">
        <div className="table-meta"><span><strong>{access.length}</strong> Spieler</span><span>Basis: {npc.visibilityMode}</span></div>
        {access.length === 0 ? <div className="empty-state large"><strong>Keine Spieler im Projekt</strong><span>Lege zuerst einen Spielerzugang an.</span></div> : (
          <div className="stack">
            {access.map((entry) => {
              const allow = setNpcVisibilityAction.bind(null, projectId, npcId, entry.playerId, true);
              const deny = setNpcVisibilityAction.bind(null, projectId, npcId, entry.playerId, false);
              const saveVariant = saveNpcVariantAction.bind(null, projectId, npcId, entry.playerId);
              const removeVariant = deleteNpcVariantAction.bind(null, projectId, npcId, entry.playerId);
              return (
                <article key={entry.playerId} className="panel-card nested-card">
                  <div className="panel-heading">
                    <div><span className="panel-kicker">PLAYER #{entry.playerId}</span><h2>{entry.playerName}</h2></div>
                    <span className={`visibility-pill ${entry.visible ? "all_players" : "admin_only"}`}>{entry.visible ? (entry.hasVariant ? "Eigener Schein-Eintrag" : "Echter Eintrag") : "Nicht sichtbar"}</span>
                  </div>
                  <div className="row wrap-row">
                    <form action={allow}><button className="button ghost" type="submit">Freischalten</button></form>
                    <form action={deny}><button className="button ghost" type="submit">Sperren</button></form>
                    {entry.explicit ? <small className="muted">Explizite Spielerregel</small> : <small className="muted">Vom Basis-Modus geerbt</small>}
                  </div>
                  <details className="create-dropdown" open={entry.hasVariant || undefined}>
                    <summary className="button ghost">{entry.hasVariant ? "Schein-Eintrag bearbeiten" : "Schein-Eintrag erstellen"}</summary>
                    <div className="create-popover inline-popover">
                      <form action={saveVariant} className="stack">
                        <label>Name-Override<input name="name" maxLength={200} defaultValue={entry.variantName ?? npc.name} /></label>
                        <label>Beschreibung-Override<textarea name="description" maxLength={100000} defaultValue={entry.variantDescription ?? npc.publicDescription ?? ""} /></label>
                        <label>Bild-Override<input name="image" maxLength={4000} /></label>
                        <button className="primary" type="submit">Persönliche Version speichern</button>
                      </form>
                      {entry.hasVariant ? <form action={removeVariant}><button className="danger" type="submit">Schein-Eintrag entfernen</button></form> : null}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
