import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdminSession } from "@/lib/auth/session";
import { listRaces, type RaceRow } from "@/lib/entities/races";
import { listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";
import { RaceCreateDialog } from "./race-create-dialog";
import styles from "./races.module.css";

function mapOptions(rows: Awaited<ReturnType<typeof listProjectMaps>>) {
  return rows.map((row: any) => ({
    mapId: Number(row.map_id), name: String(row.name), mapType: row.map_type as "image" | "tile",
    tileUrl: row.tile_url ? String(row.tile_url) : null, imagePath: row.image_path ? String(row.image_path) : null,
    minZoom: Number(row.min_zoom ?? 0), maxZoom: Number(row.max_zoom ?? 6), centerLat: row.center_lat == null ? null : Number(row.center_lat),
    centerLng: row.center_lng == null ? null : Number(row.center_lng), bounds: row.bounds,
  }));
}

function mapHref(projectId: number, race: RaceRow) {
  if (!race.originMapId) return null;
  return `/admin/projects/${projectId}/map?mapId=${race.originMapId}&markerId=${-race.raceId}`;
}

function preview(race: RaceRow, compact = false) {
  return <span className={compact ? styles.subAvatar : styles.heroAvatar}>
    {race.image && race.image !== "noimage" ? <img src={race.image} alt="" loading="lazy"/> : race.name.slice(0, 1).toUpperCase()}
  </span>;
}

function SubspeciesRow({ projectId, race }: { projectId: number; race: RaceRow }) {
  const originHref = mapHref(projectId, race);
  return <div className={styles.subspeciesRow}>
    <Link className={styles.subspeciesMain} href={`/admin/projects/${projectId}/races/${race.raceId}`}>
      {preview(race, true)}
      <span className={styles.subspeciesText}><strong>{race.name}</strong><small>{race.characterCount} Character{race.characterCount === 1 ? "" : "s"}{race.originMapName ? ` · Ursprung: ${race.originMapName}` : " · kein Ursprung gesetzt"}</small></span>
    </Link>
    <div className={styles.subspeciesActions}>{originHref ? <Link className="button ghost" href={originHref}>⌖ Karte</Link> : null}<Link className="button ghost" href={`/admin/projects/${projectId}/races/${race.raceId}`}>Öffnen</Link></div>
  </div>;
}

function SpeciesCard({ projectId, race, children }: { projectId: number; race: RaceRow; children: RaceRow[] }) {
  const originHref = mapHref(projectId, race);
  return <article className={styles.speciesCard}>
    <div className={styles.speciesHeader}>
      <Link href={`/admin/projects/${projectId}/races/${race.raceId}`} className={styles.speciesIdentity}>{preview(race)}<span><span className={styles.typeLabel}>HAUPT-SPEZIES</span><strong>{race.name}</strong><small>{children.length} Subspezies · {race.characterCount} direkte Character</small></span></Link>
      <div className={styles.cardActions}>{originHref ? <Link className="button ghost" href={originHref}>⌖ Auf Karte</Link> : null}<Link className="button" href={`/admin/projects/${projectId}/races/${race.raceId}`}>Codex öffnen</Link></div>
    </div>
    <p className={styles.description}>{race.description?.trim() ? race.description.slice(0, 260) : "Noch keine biologische oder taxonomische Beschreibung hinterlegt."}</p>
    <div className={styles.metaRow}>{race.masculineName ? <span className="soft-label">♂ {race.masculineName}</span> : null}{race.feminineName ? <span className="soft-label">♀ {race.feminineName}</span> : null}{race.hermaphroditeName ? <span className="soft-label">⚥ {race.hermaphroditeName}</span> : null}{race.originMapName ? <span className="soft-label">⌖ {race.originMapName}</span> : <span className="soft-label">Kein Ursprung</span>}</div>
    <div className={styles.childrenBlock}>
      <div className={styles.childrenHeader}><div><strong>Subspezies</strong><small>Erben Biologie und Merkmale von {race.name}, solange sie nichts überschreiben.</small></div><span>{children.length}</span></div>
      {children.length ? <div className={styles.subspeciesList}>{children.map((child) => <SubspeciesRow key={child.raceId} projectId={projectId} race={child}/>)}</div> : <div className={styles.emptyChildren}>Noch keine Subspezies angelegt.</div>}
    </div>
  </article>;
}

export default async function RacesPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireAdminSession();
  const projectId = Number.parseInt((await params).projectId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();
  const [project, races, mapsRaw] = await Promise.all([getProject(projectId), listRaces(projectId), listProjectMaps(projectId)]);
  if (!project) notFound();

  const maps = mapOptions(mapsRaw);
  const unknownRace = races.find((race) => race.isUnknown) ?? null;
  const rootSpecies = races.filter((race) => race.parentRaceId == null && !race.isUnknown);
  const subspecies = races.filter((race) => race.parentRaceId != null);
  const byParent = new Map<number, RaceRow[]>();
  for (const race of subspecies) byParent.set(race.parentRaceId!, [...(byParent.get(race.parentRaceId!) ?? []), race]);
  const originCount = races.filter((race) => !race.isUnknown && race.originMapId != null).length;
  const characterCount = races.reduce((sum, race) => sum + race.characterCount, 0);
  const primaryMap = mapsRaw.find((map: any) => map.is_primary) ?? mapsRaw[0];

  return <AdminShell projectId={projectId} projectName={project.name} section="races" eyebrow={`${project.name} / Welt`} title="Spezies & Subspezies">
    <div className={styles.pageHero}>
      <div><div className="breadcrumb"><Link href={`/admin/projects/${projectId}`}>{project.name}</Link><span>/</span><strong>Spezies</strong></div><span className="page-kicker">BIOLOGIE & TAXONOMIE</span><h1>Spezies & Subspezies</h1><p>Baue die biologische Taxonomie deiner Welt auf. Haupt-Spezies bilden die Basis, Subspezies erben ihre Biologie und können gezielt davon abweichen.</p></div>
      <div className={styles.heroActions}><RaceCreateDialog projectId={projectId} rootSpecies={rootSpecies} maps={maps}/><Link className="button" href={`/admin/projects/${projectId}/cultures`}>Kulturen & Völker</Link>{primaryMap ? <Link className="button" href={`/admin/projects/${projectId}/map?mapId=${primaryMap.map_id}`}>⌖ Ursprünge auf Karte</Link> : null}</div>
    </div>

    <section className={styles.statGrid} aria-label="Spezies-Übersicht">
      <div className={styles.statCard}><span>Haupt-Spezies</span><strong>{rootSpecies.length}</strong><small>biologische Basiseinträge</small></div>
      <div className={styles.statCard}><span>Subspezies</span><strong>{subspecies.length}</strong><small>taxonomische Unterformen</small></div>
      <div className={styles.statCard}><span>Kartenursprünge</span><strong>{originCount}</strong><small>mit Ursprungspunkt</small></div>
      <div className={styles.statCard}><span>Characters</span><strong>{characterCount}</strong><small>aktuell zugeordnet</small></div>
    </section>

    {unknownRace ? <section className={styles.unknownBar}><div>{preview(unknownRace, true)}<span><strong>Unbekannt</strong><small>System-Fallback für Characters, deren Spezies noch nicht feststeht.</small></span></div><Link className="button ghost" href={`/admin/projects/${projectId}/races/${unknownRace.raceId}`}>Fallback öffnen</Link></section> : null}

    <section className={styles.registrySection}>
      <div className={styles.registryHeading}><div><span className="panel-kicker">TAXONOMISCHER CODEX</span><h2>{rootSpecies.length} Haupt-Spezies · {subspecies.length} Subspezies</h2><p>Subspezies stehen direkt unter ihrer Haupt-Spezies. Kartenursprünge öffnen den jeweiligen Punkt auf der Weltkarte.</p></div><RaceCreateDialog projectId={projectId} rootSpecies={rootSpecies} maps={maps}/></div>
      {rootSpecies.length === 0 ? <div className="panel-card empty-state large"><strong>Noch keine Haupt-Spezies</strong><span>Öffne „Spezies / Subspezies anlegen“, um den ersten biologischen Datensatz zu erstellen.</span></div> : <div className={styles.speciesStack}>{rootSpecies.map((race) => <SpeciesCard key={race.raceId} projectId={projectId} race={race} children={byParent.get(race.raceId) ?? []}/>)}</div>}
    </section>
  </AdminShell>;
}
