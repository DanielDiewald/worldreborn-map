import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { OpenLayersMapStudio } from "@/components/openlayers-map-studio";
import { Rock3LayerImporter } from "@/components/rock3-layer-importer";
import { requireAdminSession } from "@/lib/auth/session";
import { listLocations } from "@/lib/entities/locations";
import { listMapFeatures, listMapLayers } from "@/lib/map-features";
import { listProjectMaps } from "@/lib/maps";
import { getProject } from "@/lib/projects";

export default async function MapStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ mapId?: string }>;
}) {
  await requireAdminSession();
  const [raw, search] = await Promise.all([params, searchParams]);
  const projectId = Number.parseInt(raw.projectId, 10);
  if (!Number.isSafeInteger(projectId) || projectId <= 0) notFound();

  const [project, maps, locations] = await Promise.all([
    getProject(projectId),
    listProjectMaps(projectId),
    listLocations(projectId),
  ]);
  if (!project) notFound();

  const requested = search.mapId ? Number.parseInt(search.mapId, 10) : null;
  const selected = maps.find((map) => Number(map.map_id) === requested) ?? maps.find((map) => map.is_primary) ?? maps[0];
  if (!selected) notFound();

  const [layers, features] = await Promise.all([
    listMapLayers(projectId, Number(selected.map_id)),
    listMapFeatures(projectId, Number(selected.map_id)),
  ]);

  const config = {
    mapId: Number(selected.map_id),
    mapType: selected.map_type as "tile" | "image",
    tileUrl: selected.tile_url,
    imagePath: selected.image_path,
    minZoom: selected.min_zoom,
    maxZoom: selected.max_zoom,
    centerLat: selected.center_lat,
    centerLng: selected.center_lng,
    bounds: selected.bounds,
    config: selected.config,
  };
  const isRock3 = Boolean((selected.config as Record<string, unknown> | null)?.rock3);

  return (
    <AdminShell
      projectId={projectId}
      projectName={project.name}
      section="map"
      eyebrow={`${project.name} / Karte`}
      title={`${selected.name} · Karteneditor`}
    >
      <div className="page-heading compact-heading">
        <div>
          <div className="breadcrumb">
            <Link href={`/admin/projects/${projectId}`}>{project.name}</Link>
            <span>/</span>
            <Link href={`/admin/projects/${projectId}/settings`}>Karten</Link>
            <span>/</span>
            <strong>{selected.name}</strong>
          </div>
          <h1>Karteneditor</h1>
          <p>Wähle, was du einzeichnen möchtest, gib einen Namen ein und zeichne direkt auf der Weltkarte.</p>
        </div>

        <div className="row wrap-row">
          {maps.length > 1 ? (
            <form method="get" className="row">
              <select name="mapId" defaultValue={String(selected.map_id)} aria-label="Karte wechseln">
                {maps.map((map) => <option key={map.map_id} value={map.map_id}>{map.name}</option>)}
              </select>
              <button className="button ghost">Karte wechseln</button>
            </form>
          ) : null}
          <Link className="button ghost" href={`/admin/projects/${projectId}/settings`}>Karten verwalten</Link>
          <Link className="button ghost" href={`/admin/projects/${projectId}/map?mapId=${selected.map_id}`}>Marker-Ansicht</Link>
        </div>
      </div>

      <section className="panel-card" style={{ marginBottom: 14 }}>
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">SO GEHT'S</span>
            <h2>In vier Schritten einzeichnen</h2>
          </div>
          {isRock3 ? <span className="soft-label">Rock 3 verbunden</span> : null}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
            gap: 8,
          }}
        >
          <div className="soft-label">1 · Land / Stadt / Fluss wählen</div>
          <div className="soft-label">2 · Namen eingeben</div>
          <div className="soft-label">3 · Parent-Ort wählen</div>
          <div className="soft-label">4 · Auf der Karte zeichnen</div>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Danach kannst du das Element anklicken und seine Punkte verschieben. Änderungen an der Geometrie werden automatisch gespeichert.
        </p>
      </section>

      <details className="panel-card" style={{ marginBottom: 14 }} open={!isRock3}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          {isRock3 ? "Rock-3-Karten aktualisieren" : "Rock-3-ZIP mit dieser Karte verbinden"}
        </summary>
        <div style={{ paddingTop: 12 }}>
          <Rock3LayerImporter projectId={projectId} mapId={Number(selected.map_id)} />
        </div>
      </details>

      <section className="panel-card">
        <div className="table-meta" style={{ marginBottom: 12 }}>
          <span><strong>{layers.length}</strong> Ebenen</span>
          <span><strong>{features.length}</strong> gezeichnete Elemente</span>
          <span><strong>{locations.length}</strong> Orte</span>
          <span>Grenzen rasten an bestehenden Linien ein</span>
        </div>

        <OpenLayersMapStudio
          projectId={projectId}
          mapConfig={config}
          layers={layers}
          features={features}
          locations={locations.map((location) => ({
            loc_id: location.loc_id,
            name: location.name,
            location_kind: location.location_kind,
            parent_name: location.parent_name,
          }))}
        />
      </section>
    </AdminShell>
  );
}
