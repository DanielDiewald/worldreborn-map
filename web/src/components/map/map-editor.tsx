"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapLocationPicker } from "./map-location-picker";
import { colorWithAlpha, ensureOpenLayers, mapColor, mediaMapUrl, parseMapBounds } from "./openlayers-runtime";
import type { MapSearchItem, WorldMapConfig, WorldMapFeature, WorldMapLayer } from "./map-types";
import { locationKindLabel } from "@/lib/location-presentation";
import type { LocationKind } from "@/lib/entities/locations";
import styles from "./map-workspace.module.css";

type ToolId = "country" | "province" | "region" | "city" | "place" | "river" | "road";
type DrawMode = "Point" | "LineString" | "Polygon";
type ExistingLocation = { id: number; name: string; kind: LocationKind };
type HistoryEntry = { featureId: number; before: { type: string; coordinates: unknown }; after: { type: string; coordinates: unknown }; label: string };

const TOOLS: Record<ToolId, { label: string; description: string; mode: DrawMode; role: string; kind: LocationKind | null; color: string; icon: string }> = {
  country: { label: "Land", description: "Politische Landesgrenze", mode: "Polygon", role: "political", kind: "country", color: "#7c6ee6", icon: "◇" },
  province: { label: "Provinz", description: "Teilgebiet eines Landes", mode: "Polygon", role: "political", kind: "province", color: "#9a8be8", icon: "▱" },
  region: { label: "Region", description: "Geografisches oder politisches Gebiet", mode: "Polygon", role: "political", kind: "region", color: "#8e80d8", icon: "▧" },
  city: { label: "Stadt", description: "Siedlung als Kartenpunkt", mode: "Point", role: "settlements", kind: "city", color: "#f0b35a", icon: "●" },
  place: { label: "Ort", description: "Gebäude, Landmarke oder besonderer Ort", mode: "Point", role: "settlements", kind: "landmark", color: "#d9b66f", icon: "⌖" },
  river: { label: "Fluss", description: "Flusslauf als Linie", mode: "LineString", role: "routes", kind: null, color: "#67a9cf", icon: "≈" },
  road: { label: "Straße", description: "Straße oder Route als Linie", mode: "LineString", role: "routes", kind: null, color: "#c79a63", icon: "━" },
};

const VIEWS = [
  ["default", "Standard"], ["political", "Politisch"], ["climate", "Klima"], ["rainfall", "Niederschlag"], ["topography", "Topografie"],
] as const;

function toolFromString(value: string | null | undefined): ToolId | null { return value && value in TOOLS ? value as ToolId : null; }
function toolForLocationKind(kind: LocationKind): ToolId { if (kind === "country") return "country"; if (kind === "province") return "province"; if (kind === "region") return "region"; if (["city", "town", "village"].includes(kind)) return "city"; return "place"; }
function geometryLabel(type: string) { return type.includes("Polygon") ? "Fläche" : type.includes("Line") ? "Linie" : "Punkt"; }
function searchKindLabel(kind: MapSearchItem["kind"]) { if (kind === "location") return "Ort"; if (kind === "person") return "Person"; if (kind === "marker") return "Marker"; return "Objekt"; }
function layerGroup(layer: WorldMapLayer) {
  if (layer.layer_type === "vector") return "Eigene Inhalte";
  const role = layer.layer_role ?? "";
  if (role === "satellite") return "Basiskarte";
  if (role === "biomes" || role.startsWith("rainfall") || role.startsWith("temperature")) return "Klima";
  if (role.startsWith("elevation") || role === "land_mask") return "Terrain";
  return "Weltdaten";
}

export function MapEditor({ projectId, mapConfig, layers, features, initialTool, focusFeatureId, existingLocation = null, height = "calc(100vh - 110px)" }: {
  projectId: number; mapConfig: WorldMapConfig; layers: WorldMapLayer[]; features: WorldMapFeature[]; initialTool?: string | null;
  focusFeatureId?: number | null; existingLocation?: ExistingLocation | null; height?: string;
}) {
  const targetRef = useRef<HTMLDivElement>(null), mapRef = useRef<any>(null), drawRef = useRef<any>(null), selectRef = useRef<any>(null), modifyRef = useRef<any>(null);
  const sourceRefs = useRef(new Map<number, any>()), layerRefs = useRef(new Map<number, any>()), featureRefs = useRef(new Map<number, any>()), rowRefs = useRef(new Map<number, WorldMapFeature>());
  const beforeGeometry = useRef(new Map<number, { type: string; coordinates: unknown }>()), saveTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const vectorLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "vector"), [layers]);
  const rasterLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "raster"), [layers]);
  const firstTool = existingLocation ? toolForLocationKind(existingLocation.kind) : toolFromString(initialTool);
  const [tool, setTool] = useState<ToolId | null>(firstTool), [name, setName] = useState(existingLocation?.name ?? ""), [color, setColor] = useState(firstTool ? TOOLS[firstTool].color : "#7c6ee6");
  const [parentId, setParentId] = useState<number | null>(null), [drawing, setDrawing] = useState(false), [selectedId, setSelectedId] = useState<number | null>(null);
  const [status, setStatus] = useState(existingLocation ? `${locationKindLabel(existingLocation.kind)} „${existingLocation.name}“ kann jetzt platziert werden.` : "Auswahlwerkzeug aktiv."), [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle"), [query, setQuery] = useState(""), [searchResults, setSearchResults] = useState<MapSearchItem[]>([]), [searching, setSearching] = useState(false);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]), [redoStack, setRedoStack] = useState<HistoryEntry[]>([]), [activeView, setActiveView] = useState("default"), [layersOpen, setLayersOpen] = useState(false);
  const activeTool = tool ? TOOLS[tool] : null, selectedRow = selectedId ? rowRefs.current.get(selectedId) ?? null : null;
  const groupedLayers = useMemo(() => { const groups = new Map<string, WorldMapLayer[]>(); for (const layer of layers) { const group = layerGroup(layer); groups.set(group, [...(groups.get(group) ?? []), layer]); } return [...groups.entries()]; }, [layers]);

  function chooseTool(next: ToolId) { if (existingLocation) return; setTool(next); setColor(TOOLS[next].color); setParentId(null); setDrawing(false); setSelectedId(null); selectRef.current?.getFeatures().clear(); setError(""); setStatus(`${TOOLS[next].label} gewählt. Daten eingeben und Zeichnen starten.`); }
  function chooseSelect() { if (existingLocation) return; setTool(null); setDrawing(false); setError(""); setStatus("Auswahlwerkzeug aktiv. Klicke ein Kartenobjekt an."); }
  function layerForRole(role: string) { return vectorLayers.find((layer) => layer.layer_role === role) ?? vectorLayers[0] ?? null; }
  function scheduleLayerPatch(id: number, patch: Record<string, unknown>) { const previous = saveTimers.current.get(id); if (previous) clearTimeout(previous); saveTimers.current.set(id, setTimeout(async () => { const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/layers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.error || "Kartenebene konnte nicht gespeichert werden."); } }, 280)); }

  async function patchGeometry(featureId: number, geometry: { type: string; coordinates: unknown }) { setSaveState("saving"); const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${featureId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patchType: "geometry", geometry }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Grenze konnte nicht gespeichert werden."); const row = rowRefs.current.get(featureId); if (row) row.geometry = geometry; setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1200); }
  async function patchStyle(featureId: number, style: Record<string, unknown>) { setSaveState("saving"); const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${featureId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patchType: "style", style }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Darstellung konnte nicht gespeichert werden."); const row = rowRefs.current.get(featureId); if (row) row.style = { ...row.style, ...style }; setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1200); }
  function focusFeature(id: number) { const feature = featureRefs.current.get(id), map = mapRef.current; if (!feature || !map) return false; const extent = feature.getGeometry()?.getExtent(); if (extent) map.getView().fit(extent, { padding: [90, 90, 90, 90], maxZoom: Math.min(mapConfig.maxZoom, 5), duration: 250 }); selectRef.current?.getFeatures().clear(); selectRef.current?.getFeatures().push(feature); setSelectedId(id); return true; }

  useEffect(() => {
    let active = true;
    ensureOpenLayers().then((ol) => {
      if (!active || !targetRef.current) return;
      sourceRefs.current.clear(); layerRefs.current.clear(); featureRefs.current.clear(); rowRefs.current.clear();
      const simple = mapConfig.mapType === "image", bounds = parseMapBounds(mapConfig.bounds) ?? [[0, 0], [4096, 8192]], extent = [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]], projection = simple ? new ol.proj.Projection({ code: `WORLDREBORN:EDIT:${mapConfig.mapId}`, units: "pixels", extent }) : undefined, mapLayers: any[] = [];
      if (simple && mapConfig.imagePath) { const url = mediaMapUrl(mapConfig.imagePath); if (url) mapLayers.push(new ol.layer.Image({ zIndex: -1000, source: new ol.source.ImageStatic({ url, projection, imageExtent: extent }) })); }
      else if (mapConfig.tileUrl) mapLayers.push(new ol.layer.Tile({ zIndex: -1000, source: new ol.source.XYZ({ url: mapConfig.tileUrl, wrapX: false, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom }) }));
      for (const layer of rasterLayers) { const id = Number(layer.layer_id), isBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath); if (isBase) continue; const url = layer.source_type === "media" && layer.media_id ? `/api/media/${layer.media_id}` : layer.source_url; if (!url) continue; let rendered: any = null; if (simple && (layer.source_type === "media" || layer.source_type === "image")) rendered = new ol.layer.Image({ opacity: layer.opacity, zIndex: layer.z_index, visible: layer.visible_by_default, source: new ol.source.ImageStatic({ url, projection, imageExtent: extent }) }); else if (layer.source_type === "tile") rendered = new ol.layer.Tile({ opacity: layer.opacity, zIndex: layer.z_index, visible: layer.visible_by_default, source: new ol.source.XYZ({ url, wrapX: false }) }); if (rendered) { rendered.set("worldrebornLayerId", id); layerRefs.current.set(id, rendered); mapLayers.push(rendered); } }
      const geojson = new ol.format.GeoJSON();
      for (const layer of vectorLayers) { const id = Number(layer.layer_id), source = new ol.source.Vector(); sourceRefs.current.set(id, source); const baseFill = mapColor(layer.style?.fill, "#7c6ee6"), baseStroke = mapColor(layer.style?.stroke, "#f5f5f5"), baseWidth = Number(layer.style?.strokeWidth ?? 2); const rendered = new ol.layer.Vector({ source, zIndex: layer.z_index || 500, visible: layer.visible_by_default, opacity: layer.opacity, style: (feature: any) => { const row = rowRefs.current.get(Number(feature.get("featureId"))), type = feature.getGeometry()?.getType(), fill = mapColor(row?.style?.fill, baseFill), stroke = mapColor(row?.style?.stroke, baseStroke); return new ol.style.Style({ fill: type?.includes("Polygon") ? new ol.style.Fill({ color: colorWithAlpha(fill, 0.3) }) : undefined, stroke: new ol.style.Stroke({ color: stroke, width: Number(row?.style?.strokeWidth ?? baseWidth) }), image: new ol.style.Circle({ radius: 7, fill: new ol.style.Fill({ color: fill }), stroke: new ol.style.Stroke({ color: stroke, width: 2 }) }), text: feature.get("label") ? new ol.style.Text({ text: String(feature.get("label")), offsetY: -13, fill: new ol.style.Fill({ color: "#fff" }), stroke: new ol.style.Stroke({ color: "#111", width: 3 }) }) : undefined }); } }); rendered.set("worldrebornLayerId", id); layerRefs.current.set(id, rendered); mapLayers.push(rendered); for (const row of features.filter((item) => Number(item.layer_id) === id)) { try { const featureId = Number(row.feature_id), feature = geojson.readFeature({ type: "Feature", geometry: row.geometry, properties: { featureId, label: row.label } }); source.addFeature(feature); featureRefs.current.set(featureId, feature); rowRefs.current.set(featureId, { ...row }); } catch { /* malformed legacy geometry remains isolated */ } } }
      const view = simple ? new ol.View({ projection, center: ol.extent.getCenter(extent), zoom: 0, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom, extent }) : new ol.View({ center: ol.proj.fromLonLat([mapConfig.centerLng ?? 0, mapConfig.centerLat ?? 0]), zoom: Math.max(mapConfig.minZoom, 2), minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom });
      const map = new ol.Map({ target: targetRef.current, layers: mapLayers, view }); mapRef.current = map; if (simple) view.fit(extent, { padding: [20, 20, 20, 20] });
      const select = new ol.interaction.Select({ layers: (candidate: any) => Boolean(candidate.get("worldrebornLayerId")) && sourceRefs.current.has(Number(candidate.get("worldrebornLayerId"))) }); selectRef.current = select; map.addInteraction(select); select.on("select", (event: any) => setSelectedId(event.selected?.[0] ? Number(event.selected[0].get("featureId")) : null));
      const modify = new ol.interaction.Modify({ features: select.getFeatures(), pixelTolerance: 14 }); modifyRef.current = modify; map.addInteraction(modify); modify.on("modifystart", (event: any) => { for (const feature of event.features.getArray()) { const id = Number(feature.get("featureId")); if (id) beforeGeometry.current.set(id, geojson.writeGeometryObject(feature.getGeometry())); } }); modify.on("modifyend", async (event: any) => { setError(""); try { for (const feature of event.features.getArray()) { const id = Number(feature.get("featureId")); if (!id) continue; const after = geojson.writeGeometryObject(feature.getGeometry()), before = beforeGeometry.current.get(id); await patchGeometry(id, after); if (before) { const label = rowRefs.current.get(id)?.label ?? "Element"; setUndoStack((current) => [...current.slice(-29), { featureId: id, before, after, label }]); setRedoStack([]); } beforeGeometry.current.delete(id); } setStatus("Grenze / Position aktualisiert."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Änderung konnte nicht gespeichert werden."); } });
      for (const source of sourceRefs.current.values()) map.addInteraction(new ol.interaction.Snap({ source, pixelTolerance: 14 }));
      if (focusFeatureId) window.setTimeout(() => focusFeature(focusFeatureId), 0);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Karte konnte nicht geladen werden."));
    return () => { active = false; for (const timer of saveTimers.current.values()) clearTimeout(timer); saveTimers.current.clear(); mapRef.current?.setTarget(undefined); mapRef.current = null; sourceRefs.current.clear(); layerRefs.current.clear(); featureRefs.current.clear(); rowRefs.current.clear(); };
  }, [mapConfig, rasterLayers, vectorLayers, features, focusFeatureId]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    ensureOpenLayers().then((ol) => {
      if (drawRef.current) { map.removeInteraction(drawRef.current); drawRef.current = null; }
      selectRef.current?.setActive(!drawing); modifyRef.current?.setActive(!drawing); if (!drawing || !activeTool) return;
      const layer = layerForRole(activeTool.role); if (!layer) { setError("Für dieses Werkzeug fehlt eine passende Inhaltsebene."); setDrawing(false); return; }
      const source = sourceRefs.current.get(Number(layer.layer_id)); if (!source) return;
      const draw = new ol.interaction.Draw({ source, type: activeTool.mode, snapTolerance: 14, trace: activeTool.mode !== "Point", traceSource: source }); drawRef.current = draw; map.addInteraction(draw);
      draw.on("drawend", async (event: any) => { setError(""); setSaveState("saving"); try { const geometry = new ol.format.GeoJSON().writeGeometryObject(event.feature.getGeometry()), style = activeTool.mode === "LineString" ? { stroke: color, strokeWidth: 3 } : { fill: color, stroke: "#ffffff", strokeWidth: 2 }, linkedLocationId = existingLocation?.id ?? null; const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layerId: Number(layer.layer_id), geometry, entityType: linkedLocationId ? "location" : null, entityId: linkedLocationId, label: name.trim(), visibilityMode: "admin_only", selectedPlayerIds: [], style, metadata: { createdIn: "map-editor-v4", tool, existingLocationId: linkedLocationId }, createLocation: !linkedLocationId && activeTool.kind ? { kind: activeTool.kind, parentLocationId: parentId, locationType: locationKindLabel(activeTool.kind) } : null }) }); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Element konnte nicht gespeichert werden."); const featureId = Number(body.featureId), locationId = linkedLocationId ?? (body.locationId ? Number(body.locationId) : null), row: WorldMapFeature = { feature_id: String(featureId), layer_id: String(layer.layer_id), geometry, entity_type: locationId ? "location" : null, entity_id: locationId ? String(locationId) : null, label: name.trim(), short_description: null, visibility_mode: "admin_only", style, metadata: { createdIn: "map-editor-v4", tool, existingLocationId: linkedLocationId } }; rowRefs.current.set(featureId, row); featureRefs.current.set(featureId, event.feature); event.feature.set("featureId", featureId); event.feature.set("label", row.label); selectRef.current?.getFeatures().clear(); selectRef.current?.getFeatures().push(event.feature); setSelectedId(featureId); setDrawing(false); if (!existingLocation) { setName(""); setParentId(null); } setSaveState("saved"); setStatus(existingLocation ? `„${existingLocation.name}“ wurde auf der Karte platziert.` : `${activeTool.label} „${row.label}“ wurde erstellt.`); window.setTimeout(() => setSaveState("idle"), 1200); } catch (cause) { source.removeFeature(event.feature); setSaveState("idle"); setError(cause instanceof Error ? cause.message : "Element konnte nicht gespeichert werden."); setDrawing(false); } });
    });
    return () => { if (drawRef.current) { map.removeInteraction(drawRef.current); drawRef.current = null; } selectRef.current?.setActive(true); modifyRef.current?.setActive(true); };
  }, [drawing, activeTool, name, color, parentId, projectId, mapConfig.mapId, tool, vectorLayers, existingLocation]);

  useEffect(() => { const term = query.trim(); if (term.length < 2) { setSearchResults([]); return; } const controller = new AbortController(); const timer = window.setTimeout(async () => { setSearching(true); try { const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/search?q=${encodeURIComponent(term)}`, { signal: controller.signal }); const body = await response.json().catch(() => ({})); if (response.ok) setSearchResults(Array.isArray(body.items) ? body.items : []); } finally { setSearching(false); } }, 180); return () => { controller.abort(); window.clearTimeout(timer); }; }, [query, projectId, mapConfig.mapId]);

  async function deleteSelected() { if (!selectedId) return; const row = rowRefs.current.get(selectedId); if (!row || !window.confirm(`„${row.label}“ von der Karte entfernen? Die verknüpfte Location bleibt bestehen.`)) return; const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${selectedId}`, { method: "DELETE" }); const body = await response.json().catch(() => ({})); if (!response.ok) { setError(body.error || "Element konnte nicht entfernt werden."); return; } const source = sourceRefs.current.get(Number(row.layer_id)), feature = featureRefs.current.get(selectedId); if (source && feature) source.removeFeature(feature); featureRefs.current.delete(selectedId); rowRefs.current.delete(selectedId); selectRef.current?.getFeatures().clear(); setSelectedId(null); setStatus(`„${row.label}“ wurde von der Karte entfernt. Die Location bleibt erhalten.`); }
  async function changeSelectedColor(next: string) { if (!selectedId) return; const row = rowRefs.current.get(selectedId); if (!row) return; const key = row.geometry.type.includes("Line") ? "stroke" : "fill"; try { await patchStyle(selectedId, { [key]: next }); sourceRefs.current.get(Number(row.layer_id))?.changed(); setStatus("Farbe gespeichert."); } catch (cause) { setError(cause instanceof Error ? cause.message : "Farbe konnte nicht gespeichert werden."); } }
  async function applyHistory(entry: HistoryEntry, direction: "undo" | "redo") { const geometry = direction === "undo" ? entry.before : entry.after, feature = featureRefs.current.get(entry.featureId); if (!feature) return; const ol = await ensureOpenLayers(); feature.setGeometry(new ol.format.GeoJSON().readGeometry(geometry)); await patchGeometry(entry.featureId, geometry); sourceRefs.current.get(Number(rowRefs.current.get(entry.featureId)?.layer_id))?.changed(); focusFeature(entry.featureId); }
  async function undo() { const entry = undoStack.at(-1); if (!entry) return; try { await applyHistory(entry, "undo"); setUndoStack((current) => current.slice(0, -1)); setRedoStack((current) => [...current, entry]); setStatus(`Änderung an „${entry.label}“ rückgängig gemacht.`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Rückgängig fehlgeschlagen."); } }
  async function redo() { const entry = redoStack.at(-1); if (!entry) return; try { await applyHistory(entry, "redo"); setRedoStack((current) => current.slice(0, -1)); setUndoStack((current) => [...current, entry]); setStatus(`Änderung an „${entry.label}“ wiederhergestellt.`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Wiederholen fehlgeschlagen."); } }
  function toggleLayer(layer: WorldMapLayer, visible: boolean) { layerRefs.current.get(Number(layer.layer_id))?.setVisible(visible); scheduleLayerPatch(Number(layer.layer_id), { visibleByDefault: visible }); setActiveView("custom"); }
  function setOpacity(layer: WorldMapLayer, value: number) { layerRefs.current.get(Number(layer.layer_id))?.setOpacity(value); scheduleLayerPatch(Number(layer.layer_id), { opacity: value }); }
  function applyView(view: string) { setActiveView(view); for (const layer of layers) { const id = Number(layer.layer_id), ref = layerRefs.current.get(id); if (!ref) continue; let visible = layer.visible_by_default; if (view === "political") visible = layer.layer_type === "vector" && ["political", "settlements"].includes(layer.layer_role ?? ""); if (view === "climate") visible = layer.layer_role === "biomes" || (layer.layer_type === "vector" && layer.layer_role === "political"); if (view === "rainfall") visible = layer.layer_role === "rainfall_annual" || (layer.layer_type === "vector" && layer.layer_role === "political"); if (view === "topography") visible = ["elevation_full", "elevation_land", "land_mask"].includes(layer.layer_role ?? "") || (layer.layer_type === "vector" && layer.layer_role === "political"); ref.setVisible(visible); const checkbox = document.querySelector<HTMLInputElement>(`[data-editor-layer="${id}"]`); if (checkbox) checkbox.checked = visible; } }
  function chooseSearch(item: MapSearchItem) { if (item.featureId && focusFeature(item.featureId)) { setQuery(""); setSearchResults([]); return; } if (item.markerId) { window.location.assign(`/admin/projects/${projectId}/map?mapId=${mapConfig.mapId}&markerId=${item.markerId}`); return; } if (item.href) window.location.assign(item.href); }

  return <div className={styles.workspace} style={{ height }}>
    <div ref={targetRef} className={styles.canvas}/>

    <div className={styles.topSearch}>
      <div className={`${styles.searchShell} ${styles.glass}`}><span className={styles.searchIcon} aria-hidden="true">⌕</span><input className={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Land, Stadt, NPC oder Marker suchen …" aria-label="In dieser Welt suchen"/>{searching ? <span className={styles.searchBusy}>Suche …</span> : null}</div>
      {query.trim() ? <div className={`${styles.searchResults} ${styles.glass}`}>{searchResults.length ? searchResults.map((item, index) => <button key={`${item.kind}-${item.id}-${index}`} type="button" className={styles.searchResult} onClick={() => chooseSearch(item)}><span className={styles.searchResultMain}><strong>{item.name}</strong>{item.subtitle ? <small>{item.subtitle}</small> : null}</span><span className={styles.resultKind}>{searchKindLabel(item.kind)}</span></button>) : !searching ? <div className={styles.noResults}>Keine Treffer auf dieser Karte.</div> : null}</div> : null}
    </div>

    <div className={`${styles.toolRail} ${styles.glass}`} aria-label="Zeichenwerkzeuge">
      <button type="button" className={`${styles.toolButton}${!tool ? ` ${styles.toolButtonActive}` : ""}`} onClick={chooseSelect} disabled={Boolean(existingLocation)} aria-label="Auswählen"><span aria-hidden="true">↖</span><span className={styles.toolLabel}>Auswählen</span></button>
      <div className={styles.toolDivider}/>
      {(Object.keys(TOOLS) as ToolId[]).map((id) => <button key={id} type="button" className={`${styles.toolButton}${tool === id ? ` ${styles.toolButtonActive}` : ""}`} onClick={() => chooseTool(id)} disabled={Boolean(existingLocation && tool !== id)} aria-label={TOOLS[id].label}><span aria-hidden="true">{TOOLS[id].icon}</span><span className={styles.toolLabel}>{TOOLS[id].label}</span></button>)}
    </div>

    {activeTool ? <aside className={`${styles.createPanel} ${styles.glass}`}>
      <div className={styles.panelHeader}><div><span className={styles.kicker}>{existingLocation ? "ORT PLATZIEREN" : "ERSTELLEN"}</span><h3 className={styles.panelTitle}>{existingLocation ? existingLocation.name : activeTool.label}</h3><p className={styles.panelText}>{existingLocation ? `Bestehende ${locationKindLabel(existingLocation.kind)}-Location – es wird nur die Kartenform ergänzt.` : activeTool.description}</p></div>{!existingLocation ? <button type="button" className={styles.closeButton} onClick={chooseSelect} aria-label="Werkzeug schließen">×</button> : null}</div>
      <div className={styles.fieldStack}>
        <label className={styles.field}>Name<input value={name} onChange={(event) => setName(event.target.value)} readOnly={Boolean(existingLocation)} placeholder={`Name für ${activeTool.label}`}/></label>
        <label className={styles.field}>Farbe<div className={styles.colorRow}><input type="color" value={color} onChange={(event) => setColor(event.target.value)}/><span className={styles.colorValue}>{color}</span></div></label>
        {!existingLocation && activeTool.kind ? <MapLocationPicker projectId={projectId} parentFor={activeTool.kind} value={parentId} onChange={(id) => setParentId(id)}/> : null}
        <button type="button" className={`button primary ${styles.primaryAction}`} disabled={!name.trim() || drawing} onClick={() => setDrawing(true)}>{drawing ? "Zeichnen läuft …" : "Zeichnen beginnen"}</button>
        {drawing ? <div className={styles.drawHint}>{activeTool.mode === "Polygon" ? "Klicke entlang der Grenze. Am Startpunkt schließen. Bestehende Grenzen werden automatisch gesnappt und können nachgezeichnet werden." : activeTool.mode === "Point" ? "Klicke auf die gewünschte Position." : "Klicke entlang des Verlaufs. Doppelklick beendet die Linie."}</div> : null}
      </div>
    </aside> : null}

    <div className={styles.actionDock}>
      <button type="button" className={`${styles.iconAction} ${styles.iconActionSquare} ${styles.glass}`} disabled={!undoStack.length} onClick={() => void undo()} aria-label="Rückgängig" title="Rückgängig">↶</button>
      <button type="button" className={`${styles.iconAction} ${styles.iconActionSquare} ${styles.glass}`} disabled={!redoStack.length} onClick={() => void redo()} aria-label="Wiederholen" title="Wiederholen">↷</button>
      <button type="button" className={`${styles.iconAction} ${styles.glass}${layersOpen ? ` ${styles.actionActive}` : ""}`} onClick={() => setLayersOpen((value) => !value)} aria-expanded={layersOpen}>☷ Ebenen</button>
    </div>

    {layersOpen ? <aside className={`${styles.layerDrawer} ${styles.glass}`}>
      <div className={styles.drawerHeader}><div><strong>Kartenebenen</strong><span>Sichtbarkeit und Deckkraft</span></div><button type="button" className={styles.closeButton} onClick={() => setLayersOpen(false)} aria-label="Ebenen schließen">×</button></div>
      <div className={styles.layerList}>{groupedLayers.map(([group, rows]) => <div key={group}><div className={styles.layerSection}>{group}</div>{rows.map((layer) => { const id = Number(layer.layer_id), isBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath); return <div className={styles.layerRow} key={id}><div className={styles.layerInfo}><strong>{layer.name}</strong><small>{isBase ? "Basiskarte" : layer.layer_type === "vector" ? "Eigene Inhalte" : "Rock-3-Daten"}</small></div><div className={styles.layerControl}><input data-editor-layer={id} type="checkbox" defaultChecked={isBase || layer.visible_by_default} disabled={isBase} onChange={(event) => toggleLayer(layer, event.target.checked)} aria-label={`${layer.name} ein- oder ausblenden`}/></div>{!isBase ? <label className={styles.opacityRow}><span>Deckkraft</span><input type="range" min="0" max="1" step="0.05" defaultValue={layer.opacity} onChange={(event) => setOpacity(layer, Number(event.target.value))}/></label> : null}</div>; })}</div>)}</div>
    </aside> : null}

    <div className={`${styles.viewSwitcher} ${styles.glass}`}>{VIEWS.map(([id, label]) => <button key={id} type="button" className={`${styles.viewButton}${activeView === id ? ` ${styles.viewActive}` : ""}`} onClick={() => applyView(id)}>{label}</button>)}</div>

    {selectedRow ? <aside className={`${styles.inspector} ${styles.glass}`}>
      <div className={styles.panelHeader}><div><span className={styles.kicker}>AUSGEWÄHLT</span><h3 className={styles.panelTitle}>{selectedRow.label}</h3></div><button type="button" className={styles.closeButton} onClick={() => { selectRef.current?.getFeatures().clear(); setSelectedId(null); }} aria-label="Auswahl schließen">×</button></div>
      <span className={styles.inspectorBadge}>{geometryLabel(selectedRow.geometry.type)}</span>
      <p className={styles.inspectorText}>Ziehe die Formpunkte direkt auf der Karte. Änderungen werden automatisch gespeichert.</p>
      <div className={styles.fieldStack}><label className={styles.field}>Farbe<div className={styles.colorRow}><input key={selectedId ?? 0} type="color" defaultValue={mapColor(selectedRow.style?.fill ?? selectedRow.style?.stroke, "#7c6ee6")} onChange={(event) => void changeSelectedColor(event.target.value)}/><span className={styles.colorValue}>Darstellung</span></div></label></div>
      <div className={styles.inspectorActions}>{selectedRow.entity_type === "location" && selectedRow.entity_id ? <a className="button primary" href={`/admin/projects/${projectId}/locations/${selectedRow.entity_id}`}>Location öffnen</a> : null}<button type="button" className={`button danger ${styles.dangerAction}`} onClick={() => void deleteSelected()}>Von Karte entfernen</button><small className={styles.panelText}>Der Lore-Datensatz bleibt bestehen.</small></div>
    </aside> : null}

    <div className={`${styles.statusDock} ${styles.glass}`}><span className={`${styles.statusDot}${saveState === "saved" ? ` ${styles.statusDotSaved}` : saveState === "saving" ? ` ${styles.statusDotSaving}` : ""}`}/><span className={styles.statusText}>{saveState === "saving" ? "Speichert …" : saveState === "saved" ? "Gespeichert" : drawing ? "Zeichenmodus aktiv" : status}</span></div>
    {status && saveState === "saved" ? <div className={styles.successToast} aria-live="polite">{status}</div> : null}
    {error ? <div className={styles.errorToast} aria-live="assertive">{error}</div> : null}
  </div>;
}
