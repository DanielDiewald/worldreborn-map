import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { getNpc } from "@/lib/entities/npcs";
import { getProject } from "@/lib/projects";
import { archiveNpcAction, updateNpcAction } from "../actions";

function visibilityLabel(mode: string) {
  if (mode === "all_players") return "Alle Spieler";
  if (mode === "selected_players") return "Ausgewählte Spieler";
  return "Nur Admin";
}

export default async function NpcDetailPage({ params }: { params: Promise<{ projectId: string; npcId: string }> }) {
  await requireAdminSession();
  const raw = await params;
  const projectId = Number.parseInt(raw.projectId, 10);
  const npcId = Number.parseInt(raw.npcId, 10);
  if (!Number.isSafeInteger(projectId) || !Number.isSafeInteger(npcId) || projectId <= 0 || npcId <= 0) notFound();

  const [project, npc] = await Promise.all([getProject(projectId), getNpc(projectId, npcId)]);
  if (!project || !npc) notFound();

  const updateAction = updateNpcAction.bind(null, projectId, npcId);
  const archiveAction = archiveNpcAction.bind(null, projectId, npcId);

  return (
    <AdminShell projectId={projectId} projectName={project.name} section="npcs" eyebrow={`${project.name} / NPCs`} title={npc.name}>
      <div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><Link href={`/admin/projects/${projectId}/npcs`}>NPCs</Link><span>/</span><strong>{npc.name}</strong></div>

      <section className="entity-hero">
        <div className="entity-avatar hero-avatar">
          {npc.image && npc.image !== "noimage" ? <img src={npc.image} alt="" /> : npc.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="entity-hero-main">
          <span className="page-kicker">NPC #{npc.nId}</span>
          <h1>{npc.name}</h1>
          <p>{[npc.title, npc.species, npc.profession].filter(Boolean).join(" · ") || "Noch keine Charakterdetails hinterlegt"}</p>
          <div className="hero-tags">
            <span className="soft-label">{npc.gender || "unknown"}</span>
            <span className={`visibility-pill ${npc.visibilityMode}`}>{visibilityLabel(npc.visibilityMode)}</span>
          </div>
        </div>
        <Link href={`/admin/projects/${projectId}/npcs`} className="button ghost">← Zur NPC-Liste</Link>
      </section>

      <nav className="entity-tabs" aria-label="NPC Bereiche">
        <span className="active">Übersicht</span>
        <span className="disabled">Beziehungen <small>bald</small></span>
        <span className="disabled">Familie <small>bald</small></span>
        <span className="disabled">Timeline <small>bald</small></span>
        <span className="disabled">Karte <small>bald</small></span>
        <span className="disabled">Media <small>bald</small></span>
        <span className="disabled">Spieler-Sichtbarkeit <small>bald</small></span>
      </nav>

      <form action={updateAction} className="npc-detail-grid">
        <div className="stack detail-main">
          <section className="panel-card edit-section">
            <div className="panel-heading"><div><span className="panel-kicker">IDENTITÄT</span><h2>Grundinformationen</h2></div><span className="record-id">DB-ID #{npc.nId}</span></div>
            <div className="field-grid two">
              <label>Name<input name="name" maxLength={100} defaultValue={npc.name} required /></label>
              <label>Titel<input name="title" maxLength={120} defaultValue={npc.title ?? ""} placeholder="z. B. Lord, Königin, Erzmagier" /></label>
              <label>Spezies / Race<input name="species" maxLength={80} defaultValue={npc.species ?? ""} /></label>
              <label>Beruf / Rolle<input name="profession" maxLength={120} defaultValue={npc.profession ?? ""} /></label>
              <label>Geschlecht<input name="gender" maxLength={10} defaultValue={npc.gender} /></label>
              <label>Bild-URL<input name="image" maxLength={4000} defaultValue={npc.image === "noimage" ? "" : npc.image} /></label>
            </div>
          </section>

          <section className="panel-card edit-section">
            <div className="panel-heading"><div><span className="panel-kicker">SPIELER-WISSEN</span><h2>Öffentliche Beschreibung</h2></div><span className="public-tag">Spielerfähig</span></div>
            <p className="section-help">Dieser Text ist die Basis für Informationen, die später gezielt für Spieler freigeschaltet werden können.</p>
            <textarea name="publicDescription" className="large-textarea" maxLength={100000} defaultValue={npc.publicDescription ?? ""} placeholder="Was darf grundsätzlich über diese Person bekannt sein?" />
          </section>

          <section className="panel-card edit-section secret-section">
            <div className="panel-heading"><div><span className="panel-kicker">ADMIN ONLY</span><h2>Geheime Notizen</h2></div><span className="secret-tag">◆ Wahrheit</span></div>
            <p className="section-help">Diese Informationen dürfen niemals ungeprüft an Spieler ausgeliefert werden. Bestehendes Legacy-HTML wird als Quelltext bewahrt.</p>
            <textarea name="adminNotes" className="large-textarea" maxLength={100000} defaultValue={npc.adminNotes ?? npc.notes} />
          </section>

          <div className="sticky-savebar">
            <div><strong>Änderungen speichern</strong><span>Die bestehende NPC-ID bleibt unverändert.</span></div>
            <button className="primary" type="submit">Änderungen speichern</button>
          </div>
        </div>

        <aside className="stack detail-side">
          <section className="panel-card profile-summary">
            <div className="panel-heading"><div><span className="panel-kicker">ÜBERSICHT</span><h2>Datensatz</h2></div></div>
            <dl className="summary-list">
              <div><dt>Projekt</dt><dd>{project.name}</dd></div>
              <div><dt>NPC-ID</dt><dd>#{npc.nId}</dd></div>
              <div><dt>Sichtbarkeit</dt><dd>{visibilityLabel(npc.visibilityMode)}</dd></div>
              <div><dt>Spezies</dt><dd>{npc.species || "—"}</dd></div>
              <div><dt>Beruf</dt><dd>{npc.profession || "—"}</dd></div>
            </dl>
          </section>

          <section className="panel-card coming-card">
            <span className="panel-kicker">PLAYER KNOWLEDGE</span>
            <h2>Spielerinformationen</h2>
            <p>Pro-Spieler-Sichtbarkeit und Schein-Einträge sind im Datenmodell vorbereitet und werden hier später direkt verwaltet.</p>
            <span className="coming-badge">Nächste MVP-Phase</span>
          </section>
        </aside>
      </form>

      <section className="danger-zone">
        <div><span className="panel-kicker">DANGER ZONE</span><h2>NPC archivieren</h2><p>Der Legacy-Datensatz und seine ID werden nicht gelöscht.</p></div>
        <form action={archiveAction}><button className="danger" type="submit">NPC archivieren</button></form>
      </section>
    </AdminShell>
  );
}
