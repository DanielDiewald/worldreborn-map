import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { ConfirmAction } from "@/components/confirm-action";
import { Rock3MapCreator } from "@/components/rock3-map-creator";
import { SubmitButton } from "@/components/submit-button";
import { requireAdminSession } from "@/lib/auth/session";
import { listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";
import {
  createImageMapAction,
  createTileMapAction,
  deleteProjectMapAction,
  setPrimaryMapAction,
  updateProjectMapAction,
  updateProjectSettingsAction,
} from "./actions";

function imageDimensions(map: { bounds: unknown; config: Record<string, unknown> }) {
  const configuredWidth = Number(map.config?.width);
  const configuredHeight = Number(map.config?.height);
  if (
    Number.isFinite(configuredWidth) && configuredWidth > 0 &&
    Number.isFinite(configuredHeight) && configuredHeight > 0
  ) {
    return { width: configuredWidth, height: configuredHeight };
  }

  if (Array.isArray(map.bounds) && map.bounds.length === 2 && Array.isArray(map.bounds[1])) {
    const height = Number(map.bounds[1][0]);
    const width = Number(map.bounds[1][1]);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) return { width, height };
  }

  return { width: 1000, height: 1000 };
}

export default async function ProjectSettingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  await requireAdminSession();
  const projectId = Number.parseInt((await params).projectId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();

  const [project, maps] = await Promise.all([getProject(projectId), listProjectMaps(projectId)]);
  if (!project) notFound();

  const primaryMap = maps.find((map) => map.is_primary) ?? maps[0];

  return (
    <AdminShell
      projectId={projectId}
      projectName={project.name}
      section="settings"
      eyebrow={`${project.name} / Karten`}
      title="Karten & Projekt"
    >
      <div className="page-heading compact-heading">
        <div>
          <div className="breadcrumb">
            <Link href={`/admin/projects/${projectId}`}>{project.name}</Link>
            <span>/</span>
            <strong>Karten</strong>
          </div>
          <h1>Karten verwalten</h1>
          <p>Erstelle eine Rock-3-Weltkarte in einem Schritt. Technische Kartenquellen bleiben für Sonderfälle verfügbar.</p>
        </div>
        {primaryMap ? (
          <Link className="button primary" href={`/admin/projects/${projectId}/map/studio?mapId=${primaryMap.map_id}`}>
            Karteneditor öffnen
          </Link>
        ) : null}
      </div>

      <section className="panel-card edit-section" style={{ marginBottom: 16 }}>
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">EMPFOHLEN · ROCK 3</span>
            <h2>Neue Weltkarte aus einer ZIP</h2>
            <p>
              Kein Image Path, keine Pixelmaße, keine Layer einzeln anlegen: ZIP auswählen, Namen vergeben und loslegen.
            </p>
          </div>
          <span className="visibility-pill all_players">Einfacher Modus</span>
        </div>
        <Rock3MapCreator projectId={projectId} defaultName={`${project.name} · Weltkarte`} />
      </section>

      <div className="npc-detail-grid">
        <div className="stack detail-main">
          <section className="panel-card">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">DEINE KARTEN</span>
                <h2>{maps.length ? `${maps.length} Karte${maps.length === 1 ? "" : "n"}` : "Noch keine Karte"}</h2>
                <p>Öffne den Editor direkt. Technische Einstellungen sind nur noch bei Bedarf sichtbar.</p>
              </div>
            </div>

            {maps.length === 0 ? (
              <div className="empty-state">
                <strong>Starte mit deiner Rock-3-ZIP</strong>
                <span>Oben ZIP auswählen → Weltkarte erstellen → der Editor öffnet sich automatisch.</span>
              </div>
            ) : (
              <div className="stack">
                {maps.map((map) => {
                  const config = (map.config ?? {}) as Record<string, unknown>;
                  const dimensions = map.map_type === "image" ? imageDimensions({ bounds: map.bounds, config }) : null;
                  const noWrap = Boolean(config.no_wrap ?? config.noWrap ?? true);
                  const isRock3 = Boolean(config.rock3);

                  return (
                    <article key={map.map_id} className="panel-card nested-card">
                      <div className="panel-heading">
                        <div>
                          <div className="row wrap-row">
                            <h3 style={{ margin: 0 }}>{map.name}</h3>
                            {map.is_primary ? <span className="visibility-pill all_players">Hauptkarte</span> : null}
                            {isRock3 ? <span className="soft-label">Rock 3</span> : <span className="soft-label">{map.map_type}</span>}
                          </div>
                          <p className="muted" style={{ marginBottom: 0 }}>
                            #{map.map_id}{dimensions ? ` · ${dimensions.width} × ${dimensions.height}px` : ""} · Zoom {map.min_zoom}–{map.max_zoom}
                          </p>
                        </div>
                        <div className="row wrap-row">
                          <Link className="button primary" href={`/admin/projects/${projectId}/map/studio?mapId=${map.map_id}`}>
                            Im Editor öffnen
                          </Link>
                          <Link className="button ghost" href={`/admin/projects/${projectId}/map?mapId=${map.map_id}`}>
                            Karte ansehen
                          </Link>
                        </div>
                      </div>

                      <div className="row wrap-row">
                        {!map.is_primary ? (
                          <form action={setPrimaryMapAction.bind(null, projectId)}>
                            <input type="hidden" name="mapId" value={map.map_id} />
                            <SubmitButton className="button ghost" pendingLabel="Wird Hauptkarte …">
                              Als Hauptkarte setzen
                            </SubmitButton>
                          </form>
                        ) : (
                          <span className="muted">Diese Karte wird standardmäßig geöffnet.</span>
                        )}

                        {!map.is_primary ? (
                          <ConfirmAction
                            action={deleteProjectMapAction.bind(null, projectId, Number(map.map_id))}
                            title="Karte löschen?"
                            description={`„${map.name}“ wird gelöscht. Das ist nur möglich, wenn keine Marker mehr auf dieser Karte liegen.`}
                            triggerLabel="Löschen"
                            confirmLabel="Karte endgültig löschen"
                            pendingLabel="Karte wird gelöscht …"
                            triggerClassName="button danger"
                            confirmClassName="danger"
                          />
                        ) : null}
                      </div>

                      <details style={{ marginTop: 10 }}>
                        <summary style={{ cursor: "pointer", fontWeight: 600 }}>Technische Einstellungen</summary>
                        <form
                          action={updateProjectMapAction.bind(null, projectId, Number(map.map_id))}
                          className="stack"
                          style={{ marginTop: 12 }}
                        >
                          <input type="hidden" name="mapType" value={map.map_type} />
                          <label>
                            Kartenname
                            <input name="name" required maxLength={120} defaultValue={map.name} />
                          </label>

                          {map.map_type === "tile" ? (
                            <>
                              <label>
                                Tile URL
                                <input name="tileUrl" required defaultValue={map.tile_url ?? ""} placeholder="/tiles/{z}/{x}/{y}.png" />
                              </label>
                              <div className="field-grid two">
                                <label>Min Zoom<input name="minZoom" type="number" min={-10} max={30} defaultValue={map.min_zoom} /></label>
                                <label>Max Zoom<input name="maxZoom" type="number" min={-10} max={30} defaultValue={map.max_zoom} /></label>
                                <label>Center Latitude<input name="centerLat" type="number" step="any" defaultValue={map.center_lat ?? ""} /></label>
                                <label>Center Longitude<input name="centerLng" type="number" step="any" defaultValue={map.center_lng ?? ""} /></label>
                              </div>
                              <label><input type="checkbox" name="noWrap" defaultChecked={noWrap} /> No wrap</label>
                            </>
                          ) : (
                            <>
                              <label>
                                Bildquelle / Media-ID
                                <input name="imagePath" required defaultValue={map.image_path ?? ""} />
                              </label>
                              <div className="field-grid two">
                                <label>Breite<input name="width" type="number" min="1" step="any" required defaultValue={dimensions?.width} /></label>
                                <label>Höhe<input name="height" type="number" min="1" step="any" required defaultValue={dimensions?.height} /></label>
                                <label>Min Zoom<input name="minZoom" type="number" min={-10} max={30} defaultValue={map.min_zoom} /></label>
                                <label>Max Zoom<input name="maxZoom" type="number" min={-10} max={30} defaultValue={map.max_zoom} /></label>
                              </div>
                            </>
                          )}

                          <SubmitButton className="button ghost" pendingLabel="Speichere …">
                            Technische Einstellungen speichern
                          </SubmitButton>
                        </form>
                      </details>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <details className="panel-card">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Projektinformationen bearbeiten</summary>
            <form action={updateProjectSettingsAction.bind(null, projectId)} className="stack" style={{ marginTop: 14 }}>
              <div className="field-grid two">
                <label>Name<input name="name" required defaultValue={project.name} /></label>
                <label>
                  Status
                  <select name="status" defaultValue={project.status}>
                    <option value="active">Active</option>
                    <option value="planning">Planning</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
                <label>In-World-Datum<input name="inWorldDate" defaultValue={project.in_world_date ?? ""} placeholder="3. Zeitalter, Jahr 81" /></label>
                <label>Logo<input name="logo" defaultValue={project.logo ?? ""} /></label>
                <label>Cover/Bild<input name="image" defaultValue={project.image === "noimage" ? "" : project.image} /></label>
              </div>
              <label>Beschreibung<textarea name="description" className="large-textarea" defaultValue={project.description} /></label>
              <SubmitButton className="primary" pendingLabel="Projekt wird gespeichert …">Projekt speichern</SubmitButton>
            </form>
          </details>
        </div>

        <aside className="stack detail-side">
          <section className="panel-card">
            <span className="panel-kicker">SCHNELLSTART</span>
            <h2>Von ZIP zu Welt</h2>
            <div className="stack">
              <div><strong>1. Rock-3-ZIP auswählen</strong><p className="muted">Den kompletten Exportordner einfach als ZIP.</p></div>
              <div><strong>2. Weltkarte erstellen</strong><p className="muted">Satellite, Klima, Biome und Terrain werden automatisch erkannt.</p></div>
              <div><strong>3. Im Editor zeichnen</strong><p className="muted">Land, Provinz, Stadt, Fluss oder Straße auswählen und direkt loszeichnen.</p></div>
            </div>
          </section>

          <details className="panel-card">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Erweiterte Kartenquellen</summary>
            <p className="muted">Nur nötig für eigene Tile-Server oder einzelne Bilder außerhalb von Rock 3.</p>

            <div className="stack" style={{ marginTop: 14 }}>
              <div>
                <span className="panel-kicker">TILE MAP</span>
                <h3>Tile Map hinzufügen</h3>
                <form action={createTileMapAction.bind(null, projectId)} className="stack">
                  <label>Name<input name="name" required /></label>
                  <label>Tile URL<input name="tileUrl" placeholder="/tiles/{z}/{x}/{y}.png" required /></label>
                  <div className="field-grid two">
                    <label>Min Zoom<input name="minZoom" type="number" min={-10} max={30} defaultValue="0" /></label>
                    <label>Max Zoom<input name="maxZoom" type="number" min={-10} max={30} defaultValue="6" /></label>
                    <label>Center Latitude<input name="centerLat" type="number" step="any" placeholder="0" /></label>
                    <label>Center Longitude<input name="centerLng" type="number" step="any" placeholder="0" /></label>
                  </div>
                  <label><input type="checkbox" name="noWrap" defaultChecked /> No wrap</label>
                  <label><input type="checkbox" name="isPrimary" /> Als Hauptkarte</label>
                  <SubmitButton className="button ghost" pendingLabel="Tile Map wird angelegt …">Tile Map anlegen</SubmitButton>
                </form>
              </div>

              <hr />

              <div>
                <span className="panel-kicker">IMAGE MAP</span>
                <h3>Einzelnes Bild registrieren</h3>
                <form action={createImageMapAction.bind(null, projectId)} className="stack">
                  <label>Name<input name="name" required /></label>
                  <label>Storage/Image Path<input name="imagePath" required /></label>
                  <div className="field-grid two">
                    <label>Breite<input name="width" type="number" min="1" step="any" required /></label>
                    <label>Höhe<input name="height" type="number" min="1" step="any" required /></label>
                    <label>Min Zoom<input name="minZoom" type="number" min={-10} max={30} defaultValue="-2" /></label>
                    <label>Max Zoom<input name="maxZoom" type="number" min={-10} max={30} defaultValue="4" /></label>
                  </div>
                  <label><input type="checkbox" name="isPrimary" /> Als Hauptkarte</label>
                  <SubmitButton className="button ghost" pendingLabel="Image Map wird angelegt …">Image Map anlegen</SubmitButton>
                </form>
              </div>
            </div>
          </details>
        </aside>
      </div>
    </AdminShell>
  );
}
