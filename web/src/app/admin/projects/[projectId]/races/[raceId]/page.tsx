import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmAction } from "@/components/confirm-action";
import { ImageSourceInput } from "@/components/image-source-input";
import { RaceOriginPicker } from "@/components/race-origin-picker";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminSession } from "@/lib/auth/session";
import { getRace } from "@/lib/entities/races";
import { listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";
import { archiveRaceAction, updateRaceAction } from "../actions";

function mapOptions(rows: Awaited<ReturnType<typeof listProjectMaps>>) {
  return rows.map((row: any) => ({
    mapId: Number(row.map_id), name: String(row.name), mapType: row.map_type as "image" | "tile",
    tileUrl: row.tile_url ? String(row.tile_url) : null, imagePath: row.image_path ? String(row.image_path) : null,
    minZoom: Number(row.min_zoom ?? 0), maxZoom: Number(row.max_zoom ?? 6), centerLat: row.center_lat == null ? null : Number(row.center_lat), centerLng: row.center_lng == null ? null : Number(row.center_lng), bounds: row.bounds,
  }));
}

export default async function RaceDetailPage({ params }: { params: Promise<{ projectId: string; raceId: string }> }) {
  await requireAdminSession(); const raw = await params;
  const projectId = Number.parseInt(raw.projectId, 10), raceId = Number.parseInt(raw.raceId, 10);
  if (!Number.isSafeInteger(projectId) || !Number.isSafeInteger(raceId) || projectId <= 0 || raceId <= 0) notFound();
  const [project, race, mapsRaw] = await Promise.all([getProject(projectId), getRace(projectId, raceId), listProjectMaps(projectId)]); if (!project || !race) notFound();
  const maps = mapOptions(mapsRaw);
  const originText = race.originCoordinateMode === "xy" && race.originX != null && race.originY != null ? `X ${race.originX} · Y ${race.originY}` : race.originCoordinateMode === "latlng" && race.originLat != null && race.originLng != null ? `${race.originLat.toFixed(5)}°, ${race.originLng.toFixed(5)}°` : "Nicht gesetzt";
  return <AdminShell projectId={projectId} projectName={project.name} section="races" eyebrow={`${project.name} / Spezies`} title={race.name}>
    <div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><Link href={`/admin/projects/${projectId}/races`}>Spezies</Link><span>/</span><strong>{race.name}</strong></div>
    <section className="entity-hero"><div className="entity-avatar hero-avatar">{race.image && race.image !== "noimage" ? <img src={race.image} alt=""/> : race.name.slice(0, 1).toUpperCase()}</div><div className="entity-hero-main"><span className="page-kicker">Spezies #{race.raceId}</span><h1>{race.name}</h1><p>{race.description || "Noch keine Beschreibung."}</p><div className="hero-tags"><span className="soft-label">{race.characterCount} Characters</span>{race.originMapName ? <span className="soft-label">⌖ {race.originMapName} · {originText}</span> : null}</div></div></section>

    <form action={updateRaceAction.bind(null, projectId, raceId)} className="npc-detail-grid"><div className="stack detail-main">
      <section className="panel-card edit-section"><div className="panel-heading"><div><span className="panel-kicker">BEZEICHNUNGEN</span><h2>Name & Geschlechtsformen</h2></div><span className="record-id">race_id #{race.raceId}</span></div><p className="section-help">Der Grundbegriff ist die neutrale Rückfallbezeichnung. Bei NPCs kann WorldReborn abhängig vom Geschlecht automatisch die passende optionale Form anzeigen.</p><div className="field-grid two"><label>Grundbegriff / Name<input name="name" maxLength={120} defaultValue={race.name} required/></label><label>Männliche Bezeichnung <span className="muted">optional</span><input name="masculineName" maxLength={120} defaultValue={race.masculineName ?? ""}/></label><label>Weibliche Bezeichnung <span className="muted">optional</span><input name="feminineName" maxLength={120} defaultValue={race.feminineName ?? ""}/></label><label>Bezeichnung für Hermaphroditen <span className="muted">optional</span><input name="hermaphroditeName" maxLength={120} defaultValue={race.hermaphroditeName ?? ""}/></label></div></section>
      <section className="panel-card edit-section"><div className="panel-heading"><div><span className="panel-kicker">AUSSEHEN & LORE</span><h2>Vorschaubild & Beschreibung</h2></div></div><ImageSourceInput current={race.image} label="Vorschaubild der Spezies"/><label>Beschreibung<textarea name="description" className="large-textarea" maxLength={100000} defaultValue={race.description ?? ""}/></label></section>
      <section className="panel-card edit-section"><div className="panel-heading"><div><span className="panel-kicker">GEOGRAFISCHER URSPRUNG</span><h2>Ungefährer Ursprung</h2></div></div><p className="section-help">Das ist bewusst nur ein ungefährer Punkt – z. B. das vermutete Ursprungsgebiet einer Spezies, nicht ihr heutiges gesamtes Verbreitungsgebiet.</p><RaceOriginPicker maps={maps} initial={{mapId:race.originMapId,coordinateMode:race.originCoordinateMode,x:race.originX,y:race.originY,lat:race.originLat,lng:race.originLng}}/></section>
      <div className="sticky-savebar"><div><strong>Spezies speichern</strong><span>Eine Namensänderung aktualisiert auch den Legacy-Race-Text aller verknüpften Characters.</span></div><SubmitButton className="primary" pendingLabel="Spezies wird gespeichert …">Speichern</SubmitButton></div>
    </div><aside className="stack detail-side">
      <section className="panel-card profile-summary"><div className="panel-heading"><div><span className="panel-kicker">ÜBERSICHT</span><h2>{race.name}</h2></div></div><dl className="summary-list"><div><dt>Characters</dt><dd>{race.characterCount}</dd></div><div><dt>Männlich</dt><dd>{race.masculineName || race.name}</dd></div><div><dt>Weiblich</dt><dd>{race.feminineName || race.name}</dd></div><div><dt>Hermaphrodit</dt><dd>{race.hermaphroditeName || race.name}</dd></div><div><dt>Ursprungskarte</dt><dd>{race.originMapName || "—"}</dd></div><div><dt>Koordinaten</dt><dd>{originText}</dd></div></dl></section>
      <Link className="button primary" href={`/admin/projects/${projectId}/npcs?raceId=${race.raceId}`}>Characters dieser Spezies</Link>
    </aside></form>

    <section className="danger-zone"><div><span className="panel-kicker">DANGER ZONE</span><h2>Spezies archivieren</h2><p>{race.characterCount > 0 ? "Diese Spezies kann erst archiviert werden, wenn kein aktiver Character sie mehr verwendet." : "Der Datensatz wird aus aktiven Auswahllisten entfernt."}</p></div><ConfirmAction action={archiveRaceAction.bind(null, projectId, raceId)} title={`${race.name} archivieren?`} description="Bestehende Worldbuilding-Daten werden nicht physisch gelöscht." triggerLabel="Archivieren…" confirmLabel="Spezies archivieren" triggerClassName="button danger"/></section>
  </AdminShell>;
}
