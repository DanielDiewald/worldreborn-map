import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ImageSourceInput } from "@/components/image-source-input";
import { RaceOriginPicker } from "@/components/race-origin-picker";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminSession } from "@/lib/auth/session";
import { listRaces } from "@/lib/entities/races";
import { listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";
import { createRaceAction } from "./actions";
import styles from "./races.module.css";

function mapOptions(rows: Awaited<ReturnType<typeof listProjectMaps>>) {
  return rows.map((row: any) => ({
    mapId: Number(row.map_id), name: String(row.name), mapType: row.map_type as "image" | "tile",
    tileUrl: row.tile_url ? String(row.tile_url) : null, imagePath: row.image_path ? String(row.image_path) : null,
    minZoom: Number(row.min_zoom ?? 0), maxZoom: Number(row.max_zoom ?? 6), centerLat: row.center_lat == null ? null : Number(row.center_lat), centerLng: row.center_lng == null ? null : Number(row.center_lng), bounds: row.bounds,
  }));
}

export default async function RacesPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireAdminSession();
  const projectId = Number.parseInt((await params).projectId, 10); if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();
  const [project, races, mapsRaw] = await Promise.all([getProject(projectId), listRaces(projectId), listProjectMaps(projectId)]); if (!project) notFound();
  const maps = mapOptions(mapsRaw);
  return <AdminShell projectId={projectId} projectName={project.name} section="races" eyebrow={`${project.name} / Welt`} title="Spezies & Völker">
    <div className="page-heading"><div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Spezies</strong></div><h1>Spezies & Völker</h1><p>Race/Spezies ist jetzt ein eigener Weltdatensatz. Geschlechtsspezifische Bezeichnungen, Beschreibung, Bild und ungefährer Kartenursprung werden hier zentral gepflegt.</p></div><Link className="button" href={`/admin/projects/${projectId}/npcs`}>NPCs öffnen</Link></div>

    <section className="panel-card stack">
      <div className="panel-heading"><div><span className="panel-kicker">NEUER WELTDATENSATZ</span><h2>Spezies anlegen</h2></div></div>
      <form action={createRaceAction.bind(null, projectId)} className="stack">
        <div className="field-grid two"><label>Grundbegriff / Name<input name="name" maxLength={120} required placeholder="z. B. Elfen"/></label><label>Männliche Bezeichnung <span className="muted">optional</span><input name="masculineName" maxLength={120} placeholder="z. B. Elf"/></label><label>Weibliche Bezeichnung <span className="muted">optional</span><input name="feminineName" maxLength={120} placeholder="z. B. Elfin"/></label><label>Bezeichnung für Hermaphroditen <span className="muted">optional</span><input name="hermaphroditeName" maxLength={120}/></label></div>
        <label>Beschreibung<textarea name="description" className="large-textarea" maxLength={100000} placeholder="Aussehen, Kultur, Biologie, Geschichte …"/></label>
        <ImageSourceInput label="Vorschaubild der Spezies"/>
        <RaceOriginPicker maps={maps}/>
        <SubmitButton className="primary" pendingLabel="Spezies wird angelegt …">Spezies anlegen</SubmitButton>
      </form>
    </section>

    <section className="panel-card">
      <div className="panel-heading"><div><span className="panel-kicker">WELTREGISTER</span><h2>{races.length} Spezies</h2></div></div>
      {races.length === 0 ? <div className="empty-state large"><strong>Noch keine Spezies</strong><span>Lege oben den ersten Race-/Spezies-Datensatz an.</span></div> : <div className={styles.grid}>{races.map((race) => <Link key={race.raceId} href={`/admin/projects/${projectId}/races/${race.raceId}`} className={styles.card}>
        <div className={styles.top}><span className={styles.avatar}>{race.image && race.image !== "noimage" ? <img src={race.image} alt="" loading="lazy"/> : race.name.slice(0, 1).toUpperCase()}</span><div><strong>{race.name}</strong><small>{race.characterCount} Character{race.characterCount === 1 ? "" : "s"}</small></div></div>
        <p>{race.description?.trim() ? race.description.slice(0, 180) : "Noch keine Beschreibung."}</p>
        <div className={styles.tags}>{race.masculineName ? <span className="soft-label">♂ {race.masculineName}</span> : null}{race.feminineName ? <span className="soft-label">♀ {race.feminineName}</span> : null}{race.hermaphroditeName ? <span className="soft-label">⚥ {race.hermaphroditeName}</span> : null}{race.originMapName ? <span className="soft-label">⌖ {race.originMapName}</span> : null}</div>
      </Link>)}</div>}
    </section>
  </AdminShell>;
}
