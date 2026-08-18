"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { EntityPicker } from "@/components/entity-picker";
import styles from "./map-viewer.module.css";

type MapConfig = {
  mapId: number;
  mapType: "tile" | "image";
  tileUrl: string | null;
  imagePath: string | null;
  minZoom: number;
  maxZoom: number;
  centerLat: number | null;
  centerLng: number | null;
  bounds: unknown;
  config: Record<string, unknown>;
};

export type MapMarker = {
  marker_id: string | number;
  marker_type: string;
  entity_type?: string | null;
  entity_id?: string | number | null;
  entity_label?: string | null;
  entity_kind?: string | null;
  coordinate_mode: string;
  lat: number | null;
  lng: number | null;
  x: number | null;
  y: number | null;
  icon?: string | null;
  label: string;
  short_description?: string | null;
  visibility_mode?: string;
  selected_player_ids?: number[];
  layer: string;
  z_index: number;
  metadata?: Record<string, unknown>;
};

type PlayerOption = { userId: number; displayName: string };
type LeafletPoint = { lat: number; lng: number };
type LeafletMarker = {
  addTo(map: LeafletMap): LeafletMarker;
  bindPopup(content: HTMLElement | string): LeafletMarker;
  bindTooltip(content: string, options?: Record<string, unknown>): LeafletMarker;
  on(event: string, handler: () => void): LeafletMarker;
  getLatLng(): LeafletPoint;
  openPopup(): LeafletMarker;
  remove(): void;
};
type LeafletMap = {
  setView(center: [number, number], zoom: number): LeafletMap;
  fitBounds(bounds: [[number, number], [number, number]], options?: Record<string, unknown>): LeafletMap;
  panTo(center: [number, number]): LeafletMap;
  getZoom(): number;
  on(event: string, handler: (event: { latlng: LeafletPoint }) => void): LeafletMap;
  off(event: string, handler: (event: { latlng: LeafletPoint }) => void): LeafletMap;
  invalidateSize(): void;
  remove(): void;
};
type LeafletApi = {
  CRS: { Simple: unknown };
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): { addTo(map: LeafletMap): unknown };
  imageOverlay(url: string, bounds: [[number, number], [number, number]]): { addTo(map: LeafletMap): unknown };
  marker(position: [number, number], options?: Record<string, unknown>): LeafletMarker;
};

type MarkerPayload = {
  markerType: string;
  entityType: string | null;
  entityId: number | null;
  coordinateMode: "latlng" | "xy";
  lat: number | null;
  lng: number | null;
  x: number | null;
  y: number | null;
  icon: string | null;
  label: string;
  shortDescription: string | null;
  visibilityMode: "admin_only" | "all_players" | "selected_players";
  selectedPlayerIds: number[];
  layer: string;
  zIndex: number;
};

declare global {
  interface Window {
    L?: LeafletApi;
  }
}

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

const MARKER_TYPES = [
  ["location", "Ort"],
  ["person", "Person"],
  ["group", "Gruppe"],
  ["event", "Event"],
  ["landmark", "Landmarke"],
  ["dungeon", "Dungeon"],
  ["portal", "Portal"],
  ["quest", "Quest"],
  ["party_location", "Gruppenposition"],
  ["player_origin", "Spieler-Herkunft"],
  ["custom", "Eigener Marker"],
] as const;

const TYPE_GLYPHS: Record<string, string> = {
  location: "⌂",
  person: "♙",
  npc: "♙",
  character: "♙",
  god: "✦",
  group: "◆",
  event: "◷",
  landmark: "▲",
  dungeon: "▣",
  portal: "◎",
  quest: "!",
  party_location: "●",
  player_origin: "◇",
  custom: "•",
};

function ensureLeaflet(): Promise<LeafletApi> {
  if (window.L) return Promise.resolve(window.L);
  if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS;
    document.head.appendChild(link);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LEAFLET_JS}"]`);
    const script = existing ?? document.createElement("script");
    const done = () => {
      if (window.L) resolve(window.L);
      else reject(new Error("Leaflet konnte nicht geladen werden."));
    };
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("Leaflet konnte nicht geladen werden.")), { once: true });
    if (!existing) {
      script.src = LEAFLET_JS;
      script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      script.crossOrigin = "";
      document.head.appendChild(script);
    }
  });
}

function parseBounds(value: unknown): [[number, number], [number, number]] | null {
  if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[0]) || !Array.isArray(value[1])) return null;
  const a = value[0].map(Number);
  const b = value[1].map(Number);
  return a.length >= 2 && b.length >= 2 && a.every(Number.isFinite) && b.every(Number.isFinite)
    ? [[a[0], a[1]], [b[0], b[1]]]
    : null;
}

function markerPosition(marker: MapMarker): [number, number] | null {
  if (marker.coordinate_mode === "xy" && marker.x != null && marker.y != null) return [marker.y, marker.x];
  if (marker.lat != null && marker.lng != null) return [marker.lat, marker.lng];
  return null;
}

function entityHref(projectId: number, marker: MapMarker) {
  const id = Number(marker.entity_id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (marker.entity_type === "person") return `/admin/projects/${projectId}/npcs/${id}`;
  if (marker.entity_type === "group") return `/admin/projects/${projectId}/groups/${id}`;
  if (marker.entity_type === "location") return `/admin/projects/${projectId}/locations/${id}`;
  if (marker.entity_type === "event") return `/admin/projects/${projectId}/timeline/${id}`;
  return null;
}

function formatCoordinate(mapType: MapConfig["mapType"], point: LeafletPoint) {
  return mapType === "image"
    ? `X ${point.lng.toFixed(1)} · Y ${point.lat.toFixed(1)}`
    : `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}

function MarkerEditor({
  projectId,
  mapConfig,
  marker,
  draftPoint,
  players,
  saving,
  onSave,
  onDelete,
  onCancel,
}: {
  projectId: number;
  mapConfig: MapConfig;
  marker: MapMarker | null;
  draftPoint: LeafletPoint | null;
  players: PlayerOption[];
  saving: boolean;
  onSave: (payload: MarkerPayload) => Promise<void>;
  onDelete: (() => Promise<void>) | null;
  onCancel: () => void;
}) {
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [visibility, setVisibility] = useState<MarkerPayload["visibilityMode"]>(
    (marker?.visibility_mode ?? "admin_only") as MarkerPayload["visibilityMode"],
  );
  const supportedEntity = marker?.entity_type && ["person", "group", "location", "event"].includes(marker.entity_type);
  const currentPoint = marker ? markerPosition(marker) : draftPoint ? [draftPoint.lat, draftPoint.lng] as [number, number] : null;
  const currentTypeKnown = marker ? MARKER_TYPES.some(([value]) => value === marker.marker_type) : true;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const entityRef = String(form.get("entityRef") ?? "").trim();
    let entityType: string | null = null;
    let entityId: number | null = null;
    if (entityRef) {
      const [type, rawId] = entityRef.split(":", 2);
      const parsedId = Number(rawId);
      if (["person", "group", "location", "event"].includes(type) && Number.isSafeInteger(parsedId) && parsedId > 0) {
        entityType = type;
        entityId = parsedId;
      }
    }

    const selectedPlayerIds = form
      .getAll("selectedPlayerId")
      .map((value) => Number(value))
      .filter((value) => Number.isSafeInteger(value) && value > 0);
    const point = marker ? markerPosition(marker) : draftPoint ? [draftPoint.lat, draftPoint.lng] as [number, number] : null;
    if (!point) return;
    const coordinateMode = mapConfig.mapType === "image" ? "xy" : "latlng";

    await onSave({
      markerType: String(form.get("markerType") ?? "custom"),
      entityType,
      entityId,
      coordinateMode,
      lat: coordinateMode === "latlng" ? point[0] : null,
      lng: coordinateMode === "latlng" ? point[1] : null,
      x: coordinateMode === "xy" ? point[1] : null,
      y: coordinateMode === "xy" ? point[0] : null,
      icon: String(form.get("icon") ?? "").trim() || null,
      label: String(form.get("label") ?? "").trim(),
      shortDescription: String(form.get("shortDescription") ?? "").trim() || null,
      visibilityMode: visibility,
      selectedPlayerIds,
      layer: String(form.get("layer") ?? "default").trim() || "default",
      zIndex: Number(form.get("zIndex") ?? 0) || 0,
    });
  };

  return <form className={styles.editor} onSubmit={submit}>
    <div className={styles.sideHeader}>
      <div>
        <span className="panel-kicker">{marker ? "MARKER BEARBEITEN" : "NEUER MARKER"}</span>
        <h3>{marker?.label ?? "Marker platzieren"}</h3>
      </div>
      <button type="button" className="button ghost" onClick={onCancel}>Schließen</button>
    </div>

    {currentPoint ? <div className={styles.coordinates}>
      <span><strong>{mapConfig.mapType === "image" ? "X" : "Latitude"}</strong><br/>{(mapConfig.mapType === "image" ? currentPoint[1] : currentPoint[0]).toFixed(mapConfig.mapType === "image" ? 1 : 5)}</span>
      <span><strong>{mapConfig.mapType === "image" ? "Y" : "Longitude"}</strong><br/>{(mapConfig.mapType === "image" ? currentPoint[0] : currentPoint[1]).toFixed(mapConfig.mapType === "image" ? 1 : 5)}</span>
    </div> : null}

    <label>Name<input name="label" required maxLength={200} defaultValue={marker?.label ?? ""}/></label>
    <div className={styles.fieldGrid}>
      <label>Typ<select name="markerType" defaultValue={marker?.marker_type ?? "custom"}>
        {!currentTypeKnown && marker ? <option value={marker.marker_type}>{marker.marker_type}</option> : null}
        {MARKER_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Layer<input name="layer" maxLength={80} defaultValue={marker?.layer ?? "default"}/></label>
    </div>

    <EntityPicker
      projectId={projectId}
      name="entityRef"
      types={["person","group","location","event"]}
      includeTypeInValue
      label="Verknüpfte Entität"
      placeholder="Person, Gruppe, Ort oder Event suchen …"
      initialValue={supportedEntity && marker?.entity_id ? `${marker.entity_type}:${marker.entity_id}` : ""}
      initialLabel={supportedEntity ? marker?.entity_label ?? "" : ""}
      initialKind={supportedEntity ? marker?.entity_kind ?? marker?.entity_type ?? "" : ""}
      hint="Optional. Verknüpfte Entitäten müssen zum selben Projekt gehören."
    />

    <label>Kurzbeschreibung<textarea name="shortDescription" rows={4} defaultValue={marker?.short_description ?? ""}/></label>
    <div className={styles.fieldGrid}>
      <label>Icon/Pfad<input name="icon" maxLength={4000} defaultValue={marker?.icon ?? ""} placeholder="optional"/></label>
      <label>Z-Index<input name="zIndex" type="number" min={-100000} max={100000} defaultValue={marker?.z_index ?? 0}/></label>
    </div>

    <label>Sichtbarkeit<select name="visibilityMode" value={visibility} onChange={(event)=>setVisibility(event.target.value as MarkerPayload["visibilityMode"])}>
      <option value="admin_only">Nur Admin</option>
      <option value="all_players">Alle Spieler</option>
      <option value="selected_players">Ausgewählte Spieler</option>
    </select></label>

    {visibility === "selected_players" ? <fieldset className={styles.playerGrid}>
      <legend>Freigabe für Spieler</legend>
      {players.length === 0 ? <span className="muted">Keine aktiven Spieler im Projekt.</span> : players.map((player) => <label className={styles.playerOption} key={player.userId}>
        <input type="checkbox" name="selectedPlayerId" value={player.userId} defaultChecked={marker?.selected_player_ids?.includes(player.userId) ?? false}/>
        <span>{player.displayName}</span>
      </label>)}
    </fieldset> : null}

    <div className="row wrap-row">
      <button className="primary" disabled={saving}>{saving ? "Speichere …" : marker ? "Marker speichern" : "Marker anlegen"}</button>
      {marker && onDelete ? <button type="button" className="button danger" onClick={()=>deleteDialog.current?.showModal()}>Löschen</button> : null}
    </div>

    {marker && onDelete ? <dialog ref={deleteDialog} className={styles.dialog} onCancel={(event)=>{event.preventDefault();deleteDialog.current?.close();}}>
      <div className="stack">
        <div><span className="panel-kicker">BESTÄTIGUNG</span><h3>Marker löschen?</h3><p>„{marker.label}“ wird von dieser Karte entfernt. Verknüpfte Lore-Entitäten bleiben unverändert.</p></div>
        <div className="row end"><button type="button" className="button ghost" onClick={()=>deleteDialog.current?.close()}>Abbrechen</button><button type="button" className="danger" disabled={saving} onClick={async()=>{deleteDialog.current?.close();await onDelete();}}>Marker löschen</button></div>
      </div>
    </dialog> : null}
  </form>;
}

export function MapViewer({
  mapConfig,
  initialMarkers,
  admin = false,
  projectId,
  players = [],
}: {
  mapConfig: MapConfig;
  initialMarkers: MapMarker[];
  admin?: boolean;
  projectId?: number;
  players?: PlayerOption[];
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletApiRef = useRef<LeafletApi | null>(null);
  const markerInstancesRef = useRef<Map<string, LeafletMarker>>(new Map());
  const [markers, setMarkers] = useState<MapMarker[]>(initialMarkers);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(() => new Set(initialMarkers.map((marker) => marker.layer)));
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [draftPoint, setDraftPoint] = useState<LeafletPoint | null>(null);
  const [mapRevision, setMapRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const layers = useMemo(() => [...new Set(markers.map((marker) => marker.layer))].sort((a,b)=>a.localeCompare(b,"de")), [markers]);
  const markerTypes = useMemo(() => [...new Set(markers.map((marker) => marker.marker_type))].sort((a,b)=>a.localeCompare(b,"de")), [markers]);
  const normalizedQuery = query.trim().toLocaleLowerCase("de");
  const visibleMarkers = useMemo(() => markers.filter((marker) => {
    if (!visibleLayers.has(marker.layer)) return false;
    if (typeFilter && marker.marker_type !== typeFilter) return false;
    if (!normalizedQuery) return true;
    return [marker.label, marker.short_description, marker.layer, marker.marker_type, marker.entity_label, marker.entity_kind]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("de").includes(normalizedQuery));
  }), [markers, normalizedQuery, typeFilter, visibleLayers]);
  const selectedMarker = useMemo(
    () => selectedMarkerId ? markers.find((marker)=>String(marker.marker_id)===selectedMarkerId) ?? null : null,
    [markers, selectedMarkerId],
  );

  useEffect(() => {
    let active = true;
    const markerInstances = markerInstancesRef.current;
    ensureLeaflet().then((L) => {
      if (!active || !elementRef.current) return;
      const simple = mapConfig.mapType === "image";
      const map = L.map(elementRef.current, simple
        ? { crs: L.CRS.Simple, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom }
        : { minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom });
      leafletApiRef.current = L;
      leafletMapRef.current = map;

      if (simple && mapConfig.imagePath) {
        const bounds = parseBounds(mapConfig.bounds) ?? [[0, 0], [1000, 1000]];
        const source = mapConfig.imagePath.startsWith("/") ? mapConfig.imagePath : `/api/media/${mapConfig.imagePath}`;
        L.imageOverlay(source, bounds).addTo(map);
        map.fitBounds(bounds, { padding: [20, 20] });
      } else if (mapConfig.tileUrl) {
        L.tileLayer(mapConfig.tileUrl, {
          minZoom: mapConfig.minZoom,
          maxZoom: mapConfig.maxZoom,
          noWrap: Boolean(mapConfig.config.no_wrap ?? mapConfig.config.noWrap ?? true),
        }).addTo(map);
        map.setView(
          [mapConfig.centerLat ?? 0, mapConfig.centerLng ?? 0],
          Math.max(mapConfig.minZoom, Math.min(mapConfig.maxZoom, 3)),
        );
      }

      setMapRevision((current) => current + 1);
      window.setTimeout(() => map.invalidateSize(), 0);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Karte konnte nicht geladen werden.");
    });

    return () => {
      active = false;
      markerInstances.forEach((marker) => marker.remove());
      markerInstances.clear();
      const map = leafletMapRef.current;
      if (map) map.remove();
      leafletMapRef.current = null;
      leafletApiRef.current = null;
    };
  }, [mapConfig]);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || mapRevision === 0 || !admin) return;
    const handler = (event: { latlng: LeafletPoint }) => {
      if (!addMode) return;
      setSelectedMarkerId(null);
      setDraftPoint(event.latlng);
      setStatus(`Position gewählt: ${formatCoordinate(mapConfig.mapType, event.latlng)}`);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [addMode, admin, mapConfig.mapType, mapRevision]);

  useEffect(() => {
    const L = leafletApiRef.current;
    const map = leafletMapRef.current;
    if (!L || !map || mapRevision === 0) return;

    const previousInstances = markerInstancesRef.current;
    previousInstances.forEach((instance) => instance.remove());
    const instances = new Map<string, LeafletMarker>();
    markerInstancesRef.current = instances;

    for (const marker of visibleMarkers) {
      const position = markerPosition(marker);
      if (!position) continue;
      const id = String(marker.marker_id);
      const instance = L.marker(position, { draggable: admin, zIndexOffset: marker.z_index }).addTo(map);
      instances.set(id, instance);
      instance.bindTooltip(marker.label, { direction: "top" });
      instance.on("click", () => setSelectedMarkerId(id));

      const popup = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = marker.label;
      popup.append(title);
      if (marker.short_description) {
        const description = document.createElement("p");
        description.textContent = marker.short_description;
        popup.append(description);
      }
      const type = document.createElement("small");
      type.textContent = `${marker.marker_type} · ${marker.layer}`;
      popup.append(type);
      if (marker.entity_label) {
        const entity = document.createElement("div");
        entity.textContent = `↳ ${marker.entity_label}${marker.entity_kind ? ` · ${marker.entity_kind}` : ""}`;
        popup.append(entity);
      }

      if (admin && projectId) {
        const href = entityHref(projectId, marker);
        if (href) {
          const link = document.createElement("a");
          link.href = href;
          link.textContent = "Verknüpfte Entität öffnen";
          link.className = styles.popupLink;
          popup.append(link);
        }
        const actions = document.createElement("div");
        actions.className = styles.popupActions;
        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Bearbeiten";
        edit.addEventListener("click", () => {
          setSelectedMarkerId(id);
          setDraftPoint(null);
          setAddMode(false);
        });
        actions.append(edit);
        popup.append(actions);

        instance.on("dragend", async () => {
          const point = instance.getLatLng();
          const positionPayload = marker.coordinate_mode === "xy"
            ? { x: point.lng, y: point.lat }
            : { lat: point.lat, lng: point.lng };
          try {
            const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/markers/${marker.marker_id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ operation: "move", position: positionPayload }),
            });
            if (!response.ok) throw new Error("Position konnte nicht gespeichert werden.");
            setMarkers((current) => current.map((item) => String(item.marker_id) === id
              ? marker.coordinate_mode === "xy"
                ? { ...item, x: point.lng, y: point.lat }
                : { ...item, lat: point.lat, lng: point.lng }
              : item));
            setStatus(`„${marker.label}“ verschoben und gespeichert.`);
          } catch (moveError) {
            setError(moveError instanceof Error ? moveError.message : "Marker konnte nicht verschoben werden.");
          }
        });
      }
      instance.bindPopup(popup);
    }

    return () => {
      instances.forEach((instance) => instance.remove());
      instances.clear();
    };
  }, [admin, mapConfig.mapId, mapRevision, projectId, visibleMarkers]);

  const refreshMarkers = async () => {
    if (!admin || !projectId) return;
    const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/markers`, { cache: "no-store" });
    if (!response.ok) throw new Error("Marker konnten nicht neu geladen werden.");
    const payload = await response.json() as { markers?: MapMarker[] };
    const next = Array.isArray(payload.markers) ? payload.markers : [];
    setMarkers(next);
    setVisibleLayers((current) => {
      const merged = new Set(current);
      next.forEach((marker) => merged.add(marker.layer));
      return merged;
    });
  };

  const responseMessage = async (response: Response, fallback: string) => {
    try {
      const payload = await response.json() as { error?: string };
      return payload.error || fallback;
    } catch {
      return fallback;
    }
  };

  const saveMarker = async (payload: MarkerPayload) => {
    if (!admin || !projectId) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const editing = selectedMarker;
      const url = editing
        ? `/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/markers/${editing.marker_id}`
        : `/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/markers`;
      const response = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await responseMessage(response, editing ? "Marker konnte nicht gespeichert werden." : "Marker konnte nicht angelegt werden."));
      }
      let createdId: string | null = null;
      if (!editing) {
        const result = await response.json() as { markerId?: string | number };
        if (result.markerId != null) createdId = String(result.markerId);
      }
      await refreshMarkers();
      if (createdId) setSelectedMarkerId(createdId);
      setDraftPoint(null);
      setAddMode(false);
      setStatus(editing ? "Marker gespeichert." : "Marker angelegt.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Marker konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const deleteMarker = async () => {
    if (!admin || !projectId || !selectedMarker) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/markers/${selectedMarker.marker_id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseMessage(response, "Marker konnte nicht gelöscht werden."));
      const id = String(selectedMarker.marker_id);
      markerInstancesRef.current.get(id)?.remove();
      markerInstancesRef.current.delete(id);
      setMarkers((current) => current.filter((marker) => String(marker.marker_id) !== id));
      setSelectedMarkerId(null);
      setStatus("Marker gelöscht. Verknüpfte Lore-Daten wurden nicht verändert.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Marker konnte nicht gelöscht werden.");
    } finally {
      setSaving(false);
    }
  };

  const focusMarker = (marker: MapMarker) => {
    const position = markerPosition(marker);
    const map = leafletMapRef.current;
    if (!position || !map) return;
    setSelectedMarkerId(String(marker.marker_id));
    setDraftPoint(null);
    map.panTo(position);
    markerInstancesRef.current.get(String(marker.marker_id))?.openPopup();
  };

  const fitVisibleMarkers = () => {
    const map = leafletMapRef.current;
    if (!map) return;
    const positions = visibleMarkers.map(markerPosition).filter((value): value is [number, number] => Boolean(value));
    if (positions.length === 0) return;
    if (positions.length === 1) {
      map.setView(positions[0], Math.max(mapConfig.minZoom, Math.min(mapConfig.maxZoom, map.getZoom())));
      return;
    }
    const latitudes = positions.map(([lat]) => lat);
    const longitudes = positions.map(([,lng]) => lng);
    map.fitBounds([
      [Math.min(...latitudes), Math.min(...longitudes)],
      [Math.max(...latitudes), Math.max(...longitudes)],
    ], { padding: [28, 28] });
  };

  const resetView = () => {
    const map = leafletMapRef.current;
    if (!map) return;
    if (mapConfig.mapType === "image") {
      const bounds = parseBounds(mapConfig.bounds) ?? [[0,0],[1000,1000]];
      map.fitBounds(bounds, { padding: [20,20] });
    } else {
      map.setView(
        [mapConfig.centerLat ?? 0, mapConfig.centerLng ?? 0],
        Math.max(mapConfig.minZoom, Math.min(mapConfig.maxZoom, 3)),
      );
    }
  };

  const toggleLayer = (layer: string) => setVisibleLayers((current) => {
    const next = new Set(current);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    return next;
  });

  const editorKey = selectedMarker
    ? `marker-${selectedMarker.marker_id}`
    : `draft-${draftPoint?.lat ?? "none"}-${draftPoint?.lng ?? "none"}`;

  return <div className={styles.workspace}>
    <div className={styles.mapColumn}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <input className={styles.search} value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Marker, Layer oder verknüpfte Lore suchen …" aria-label="Marker suchen"/>
          <select className={styles.typeFilter} value={typeFilter} onChange={(event)=>setTypeFilter(event.target.value)} aria-label="Marker-Typ filtern">
            <option value="">Alle Typen</option>
            {markerTypes.map((type)=><option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        <div className={styles.toolbarGroup}>
          <button type="button" className="button ghost" onClick={fitVisibleMarkers} disabled={visibleMarkers.length===0}>Sichtbare einpassen</button>
          <button type="button" className="button ghost" onClick={resetView}>Ansicht zurücksetzen</button>
          {admin ? <button type="button" className={addMode ? "button" : "button primary"} onClick={()=>{setAddMode((current)=>!current);setDraftPoint(null);setSelectedMarkerId(null);setStatus(null);}}>{addMode ? "Platzieren abbrechen" : "＋ Marker"}</button> : null}
        </div>
      </div>

      <div className={styles.layerBar}>
        <strong>Layer</strong>
        {layers.map((layer)=><label key={layer} className={styles.layerToggle}><input type="checkbox" checked={visibleLayers.has(layer)} onChange={()=>toggleLayer(layer)}/><span>{layer}</span></label>)}
        {layers.length>1?<><button type="button" className="button ghost" onClick={()=>setVisibleLayers(new Set(layers))}>Alle</button><button type="button" className="button ghost" onClick={()=>setVisibleLayers(new Set())}>Keine</button></>:null}
      </div>

      {error ? <p className={`form-error ${styles.error}`} role="alert">{error}</p> : null}
      {status ? <p className="notice success" aria-live="polite">{status}</p> : null}

      <div className={styles.mapFrame}>
        {admin && addMode ? <div className={styles.mapHint}>{draftPoint ? "Position gewählt – Marker rechts ausfüllen und speichern." : "Auf die Karte klicken, um den neuen Marker zu platzieren."}</div> : null}
        <div ref={elementRef} className={styles.map} aria-label={admin ? "WorldReborn Karteneditor" : "WorldReborn Karte"}/>
      </div>
    </div>

    <aside className={styles.sideColumn}>
      <section className={`panel-card ${styles.sidePanel}`}>
        <div className={styles.sideHeader}>
          <div><span className="panel-kicker">MARKER</span><h2>{visibleMarkers.length} sichtbar</h2></div>
          <span className="muted">{markers.length} gesamt</span>
        </div>
        <div className={styles.markerList}>
          {visibleMarkers.length===0?<div className={styles.empty}>Keine Marker passen zu Layern und Filtern.</div>:visibleMarkers.map((marker)=><button type="button" key={marker.marker_id} className={styles.markerButton} data-active={String(marker.marker_id)===selectedMarkerId} onClick={()=>focusMarker(marker)}>
            <span className={styles.markerGlyph} aria-hidden="true">{TYPE_GLYPHS[marker.marker_type] ?? "•"}</span>
            <span className={styles.markerText}><strong>{marker.label}</strong><small>{[marker.entity_label,marker.layer].filter(Boolean).join(" · ")}</small></span>
            <span className={styles.markerMeta}>{marker.marker_type}</span>
          </button>)}
        </div>
      </section>

      {admin && projectId && (selectedMarker || draftPoint) ? <section className="panel-card">
        <MarkerEditor
          key={editorKey}
          projectId={projectId}
          mapConfig={mapConfig}
          marker={selectedMarker}
          draftPoint={draftPoint}
          players={players}
          saving={saving}
          onSave={saveMarker}
          onDelete={selectedMarker ? deleteMarker : null}
          onCancel={()=>{setSelectedMarkerId(null);setDraftPoint(null);setAddMode(false);}}
        />
      </section> : admin ? <section className="panel-card empty-state"><strong>Marker auswählen oder hinzufügen</strong><span>Marker können verschoben, mit Lore verknüpft und pro Spieler freigegeben werden.</span></section> : null}
    </aside>
  </div>;
}
