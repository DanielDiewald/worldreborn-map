"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapLocationPicker } from "./map-location-picker";
import { ProvinceDividerTool } from "./province-divider-tool";
import {
  POLITICAL_COLOR_PRESETS,
  automaticBorderColor,
  createMapFeatureStyle,
  defaultFeaturePresentationStyle,
  generatePoliticalPalette,
  resolveMapFeaturePresentation,
} from "./map-feature-presentation";
import { ensureOpenLayers, mediaMapUrl, parseMapBounds } from "./openlayers-runtime";
import {
  DEFAULT_MAP_CONTENT_VISIBILITY,
  MAP_CONTENT_FILTERS,
  MAP_SELECTION_SCOPES,
  allContentVisibility,
  featureContentCategory,
  selectionScopeMatchesFeature,
  type MapContentCategory,
  type MapContentVisibility,
  type MapSelectionScope,
} from "./map-content-visibility";
import type { MapSearchItem, WorldMapConfig, WorldMapFeature, WorldMapLayer } from "./map-types";
import { conformPolygonToParent, type JsonMapGeometry, type LandMaskGuide, type MapExtent } from "./map-geometry-guides";
import { clipPolygonToLandMask } from "./map-raster-clip";
import { rankSelectionCandidates, selectionCandidateFromRow, type MapSelectionCandidate } from "./map-selection";
import { isMapFeatureEditorLocked, synchronizeSharedPoliticalVertices, type SharedBoundaryUpdate } from "./map-topology";
import { loadLandMaskGuide } from "./land-mask-runtime";
import { locationKindLabel } from "@/lib/location-presentation";
import type { LocationKind } from "@/lib/entities/locations";
import styles from "./map-workspace.module.css";

type ToolId = "country" | "province" | "region" | "city" | "place" | "river" | "road";
type DrawMode = "Point" | "LineString" | "Polygon";
type ExistingLocation = { id: number; name: string; kind: LocationKind; parentId: number | null };
type HistoryEntry = { featureId: number; before: JsonMapGeometry; after: JsonMapGeometry; label: string };
type LandMaskState = "missing" | "loading" | "ready" | "error";
type PickMenu = { x: number; y: number; items: MapSelectionCandidate[] };
type HighlightController = { select: (id: number | null) => void; hover: (id: number | null) => void; clear: () => void };
type PendingPresentation = { label?: string; style: Record<string, unknown>; syncLoreName: boolean };

const TOOLS: Record<ToolId, { label: string; description: string; mode: DrawMode; role: string; kind: LocationKind | null; color: string; icon: string }> = {
  country: { label: "Land", description: "Politische Landesgrenze", mode: "Polygon", role: "political", kind: "country", color: "#7c6ee6", icon: "◇" },
  province: { label: "Provinz", description: "Teilgebiet eines Landes oder einer Region", mode: "Polygon", role: "political", kind: "province", color: "#9a8be8", icon: "▱" },
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
function geometryEqual(a: JsonMapGeometry, b: JsonMapGeometry) { return JSON.stringify(a) === JSON.stringify(b); }
function layerGroup(layer: WorldMapLayer) {
  if (layer.layer_type === "vector") return "Eigene Inhalte";
  const role = layer.layer_role ?? "";
  if (role === "satellite") return "Basiskarte";
  if (role === "biomes" || role.startsWith("rainfall") || role.startsWith("temperature")) return "Klima";
  if (role.startsWith("elevation") || role === "land_mask") return "Terrain";
  return "Weltdaten";
}
function kindFromFeature(row: WorldMapFeature): LocationKind | null {
  const kind = row.location_kind;
  if (kind && ["world","continent","country","region","province","city","town","village","district","building","landmark","wilderness","other"].includes(kind)) return kind as LocationKind;
  const tool = typeof row.metadata?.tool === "string" ? toolFromString(row.metadata.tool) : null;
  return tool ? TOOLS[tool].kind : null;
}
function candidateKindLabel(candidate: MapSelectionCandidate) {
  if (candidate.locationKind && ["world","continent","country","region","province","city","town","village","district","building","landmark","wilderness","other"].includes(candidate.locationKind)) return locationKindLabel(candidate.locationKind as LocationKind);
  return geometryLabel(candidate.geometryType);
}
function categoryForTool(tool: ToolId): MapContentCategory {
  if (tool === "country") return "countries";
  if (tool === "province") return "provinces";
  if (tool === "region") return "regions";
  if (tool === "city") return "settlements";
  if (tool === "place") return "places";
  if (tool === "river") return "rivers";
  return "roads";
}
function scopeForRow(row: WorldMapFeature): MapSelectionScope {
  const category = featureContentCategory(row);
  if (category === "countries") return "countries";
  if (category === "provinces") return "provinces";
  if (category === "regions") return "regions";
  if (category === "settlements" || category === "places") return "places";
  if (category === "rivers" || category === "roads" || row.geometry.type.includes("Line")) return "lines";
  return "all";
}
function isHex(value: string) { return /^#[0-9a-f]{6}$/i.test(value.trim()); }
function nextPaletteSeed(seed: number) { return Math.max(1, (seed * 1664525 + 1013904223) % 2_147_483_647); }

export function MapEditor({ projectId, mapConfig, layers, features, initialTool, focusFeatureId, existingLocation = null, height = "calc(100vh - 110px)" }: {
  projectId: number; mapConfig: WorldMapConfig; layers: WorldMapLayer[]; features: WorldMapFeature[]; initialTool?: string | null;
  focusFeatureId?: number | null; existingLocation?: ExistingLocation | null; height?: string;
}) {
  const targetRef = useRef<HTMLDivElement>(null), mapRef = useRef<any>(null), drawRef = useRef<any>(null), selectRef = useRef<any>(null), modifyRef = useRef<any>(null);
  const sourceRefs = useRef(new Map<number, any>()), layerRefs = useRef(new Map<number, any>()), featureRefs = useRef(new Map<number, any>()), rowRefs = useRef(new Map<number, WorldMapFeature>());
  const beforeGeometry = useRef(new Map<number, JsonMapGeometry>()), saveTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>()), landMaskRef = useRef<LandMaskGuide | null>(null), highlightRef = useRef<HighlightController | null>(null);
  const presentationTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>()), pendingPresentation = useRef(new Map<number, PendingPresentation>());
  const contentVisibilityRef = useRef<MapContentVisibility>({ ...DEFAULT_MAP_CONTENT_VISIBILITY });
  const selectionScopeRef = useRef<MapSelectionScope>("all");
  const dividerFeatureIdRef = useRef<number | null>(null);
  const showAllLabelsRef = useRef(false);
  const vectorLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "vector"), [layers]);
  const rasterLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "raster"), [layers]);
  const landMaskLayer = useMemo(() => rasterLayers.find((layer) => layer.layer_role === "land_mask"), [rasterLayers]);
  const mapExtent = useMemo<MapExtent>(() => {
    const bounds = parseMapBounds(mapConfig.bounds) ?? [[0, 0], [4096, 8192]];
    return [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]];
  }, [mapConfig.bounds]);
  const parentConformStep = useMemo(() => Math.max(2, Math.max(mapExtent[2] - mapExtent[0], mapExtent[3] - mapExtent[1]) / 900), [mapExtent]);
  const topologyTolerance = useMemo(() => Math.max(0.75, Math.max(mapExtent[2] - mapExtent[0], mapExtent[3] - mapExtent[1]) / 3000), [mapExtent]);
  const firstTool = existingLocation ? toolForLocationKind(existingLocation.kind) : toolFromString(initialTool);
  const [tool, setTool] = useState<ToolId | null>(firstTool), [name, setName] = useState(existingLocation?.name ?? ""), [color, setColor] = useState(firstTool ? TOOLS[firstTool].color : "#7c6ee6");
  const [parentId, setParentId] = useState<number | null>(existingLocation?.parentId ?? null), [drawing, setDrawing] = useState(false), [selectedId, setSelectedId] = useState<number | null>(null), [deletingId, setDeletingId] = useState<number | null>(null);
  const [status, setStatus] = useState(existingLocation ? `${locationKindLabel(existingLocation.kind)} „${existingLocation.name}“ kann jetzt platziert werden.` : "Auswahlwerkzeug aktiv."), [error, setError] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle"), [query, setQuery] = useState(""), [searchResults, setSearchResults] = useState<MapSearchItem[]>([]), [searching, setSearching] = useState(false);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]), [redoStack, setRedoStack] = useState<HistoryEntry[]>([]), [activeView, setActiveView] = useState("default"), [layersOpen, setLayersOpen] = useState(false), [landMaskState, setLandMaskState] = useState<LandMaskState>(landMaskLayer ? "loading" : "missing"), [pickMenu, setPickMenu] = useState<PickMenu | null>(null);
  const [contentVisibility, setContentVisibility] = useState<MapContentVisibility>({ ...DEFAULT_MAP_CONTENT_VISIBILITY });
  const [selectionScope, setSelectionScope] = useState<MapSelectionScope>("all");
  const [dividerFeatureId, setDividerFeatureId] = useState<number | null>(null);
  const [showAllLabels, setShowAllLabels] = useState(false), [syncLoreName, setSyncLoreName] = useState(false), [paletteSeed, setPaletteSeed] = useState(1701);
  const [, setFeatureRevision] = useState(0);
  const activeTool = tool ? TOOLS[tool] : null, selectedRow = selectedId ? rowRefs.current.get(selectedId) ?? null : null;
  const selectedKind = selectedRow ? kindFromFeature(selectedRow) : null;
  const selectedLocked = Boolean(selectedRow && isMapFeatureEditorLocked(selectedRow));
  const dividerRow = dividerFeatureId ? rowRefs.current.get(dividerFeatureId) ?? null : null;
  const groupedLayers = useMemo(() => { const groups = new Map<string, WorldMapLayer[]>(); for (const layer of layers) { const group = layerGroup(layer); groups.set(group, [...(groups.get(group) ?? []), layer]); } return [...groups.entries()]; }, [layers]);
  const selectedLayer = selectedRow ? layers.find((layer) => Number(layer.layer_id) === Number(selectedRow.layer_id)) ?? null : null;
  const selectedPresentation = selectedRow ? resolveMapFeaturePresentation(selectedRow, selectedLayer?.style ?? {}) : null;
  const selectedPolitical = Boolean(selectedRow && ["country", "region", "province"].includes(selectedKind ?? "") && ["Polygon", "MultiPolygon"].includes(selectedRow.geometry.type));
  const selectedChildren = selectedRow?.entity_type === "location" && selectedRow.entity_id ? [...rowRefs.current.entries()].filter(([, row]) => row.location_parent_id === Number(selectedRow.entity_id) && ["region", "province", "district"].includes(kindFromFeature(row) ?? "") && ["Polygon", "MultiPolygon"].includes(row.geometry.type)) : [];

  function featureHasProvinceChildren(row: WorldMapFeature) {
    if (row.entity_type !== "location" || !row.entity_id) return false;
    const locationId = Number(row.entity_id);
    if (!Number.isSafeInteger(locationId)) return false;
    for (const child of rowRefs.current.values()) {
      if (Number(child.feature_id) === Number(row.feature_id)) continue;
      if (child.location_kind === "province" && child.location_parent_id === locationId) return true;
    }
    return false;
  }

  function lockedChildrenNeedingAdjustment(parentRow: WorldMapFeature, parentGeometry: JsonMapGeometry) {
    if (parentRow.entity_type !== "location" || !parentRow.entity_id || !["Polygon", "MultiPolygon"].includes(parentGeometry.type)) return [] as string[];
    const parentLocationId = Number(parentRow.entity_id);
    if (!Number.isSafeInteger(parentLocationId)) return [] as string[];
    const conflicts: string[] = [];
    for (const child of rowRefs.current.values()) {
      if (child.location_parent_id !== parentLocationId || !["province", "region"].includes(kindFromFeature(child) ?? "") || !isMapFeatureEditorLocked(child)) continue;
      if (!["Polygon", "MultiPolygon"].includes(child.geometry.type)) continue;
      const next = conformPolygonToParent(child.geometry as JsonMapGeometry, parentGeometry, parentConformStep);
      if (!geometryEqual(child.geometry as JsonMapGeometry, next)) conflicts.push(child.label);
    }
    return conflicts;
  }

  function selectFeature(featureId: number | null) {
    const collection = selectRef.current?.getFeatures();
    collection?.clear();
    if (featureId) {
      const row = rowRefs.current.get(featureId);
      if (row && !contentVisibilityRef.current[featureContentCategory(row)]) featureId = null;
    }
    if (featureId) {
      const row = rowRefs.current.get(featureId);
      const feature = featureRefs.current.get(featureId);
      if (feature && row && !isMapFeatureEditorLocked(row)) collection?.push(feature);
    }
    setSelectedId(featureId);
    setSyncLoreName(false);
    setPickMenu(null);
    highlightRef.current?.select(featureId);
  }

  function closeProvinceDivider(restoreSelection = true) {
    const previous = dividerFeatureIdRef.current;
    dividerFeatureIdRef.current = null;
    setDividerFeatureId(null);
    if (restoreSelection && previous) selectFeature(previous);
  }

  function openProvinceDivider() {
    if (!selectedId || !selectedRow) return;
    if (selectedLocked) { setError(`„${selectedRow.label}“ ist gesperrt. Entsperre die Fläche zuerst.`); return; }
    if (!["country", "region", "province"].includes(selectedKind ?? "") || !["Polygon", "MultiPolygon"].includes(selectedRow.geometry.type) || selectedRow.entity_type !== "location" || !selectedRow.entity_id) {
      setError("Nur ein Land, eine Region oder eine Provinz mit Location-Verknüpfung kann per Trennlinie geteilt werden.");
      return;
    }
    setTool(null); setDrawing(false); setLayersOpen(false); setPickMenu(null); setError("");
    selectRef.current?.getFeatures().clear();
    dividerFeatureIdRef.current = selectedId; setDividerFeatureId(selectedId);
    setStatus(selectedKind === "province" ? `Provinz „${selectedRow.label}“: Zeichne nur die neue innere Trennlinie.` : `„${selectedRow.label}“: Erzeuge zwei Provinzen mit einer einzigen Trennlinie.`);
  }

  function refreshContentVisibility(next: MapContentVisibility) {
    contentVisibilityRef.current = next;
    setContentVisibility(next);
    try { window.localStorage.setItem(`worldreborn:map-content:${mapConfig.mapId}`, JSON.stringify(next)); } catch { /* optional preference */ }
    if (selectedId) {
      const row = rowRefs.current.get(selectedId);
      if (row && !next[featureContentCategory(row)]) selectFeature(null);
    }
    for (const layer of vectorLayers) layerRefs.current.get(Number(layer.layer_id))?.changed();
    setPickMenu(null);
    setActiveView("custom");
  }

  function toggleContent(key: keyof MapContentVisibility, visible: boolean) {
    refreshContentVisibility({ ...contentVisibilityRef.current, [key]: visible });
  }

  function toggleAllLabels(next: boolean) {
    showAllLabelsRef.current = next;
    setShowAllLabels(next);
    try { window.localStorage.setItem(`worldreborn:map-all-labels:${mapConfig.mapId}`, next ? "1" : "0"); } catch { /* optional preference */ }
    for (const layer of vectorLayers) layerRefs.current.get(Number(layer.layer_id))?.changed();
  }

  function changeSelectionScope(next: MapSelectionScope) {
    selectionScopeRef.current = next;
    setSelectionScope(next);
    setPickMenu(null);
    try { window.localStorage.setItem(`worldreborn:map-selection-scope:${mapConfig.mapId}`, next); } catch { /* optional preference */ }
    if (selectedId) {
      const row = rowRefs.current.get(selectedId);
      if (row && !selectionScopeMatchesFeature(next, row)) selectFeature(null);
    }
    setStatus(next === "all" ? "Alle sichtbaren Kartenobjekte sind auswählbar." : `Auswahlfilter „${MAP_SELECTION_SCOPES.find((scope) => scope.id === next)?.label ?? next}“ aktiv.`);
  }

  function chooseTool(next: ToolId) {
    if (existingLocation) return;
    closeProvinceDivider(false);
    const category = categoryForTool(next);
    if (!contentVisibilityRef.current[category]) refreshContentVisibility({ ...contentVisibilityRef.current, [category]: true });
    setTool(next); setColor(TOOLS[next].color); setParentId(null); setDrawing(false); selectFeature(null); setError(""); setStatus(`${TOOLS[next].label} gewählt. Daten eingeben und Zeichnen starten.`);
  }
  function chooseSelect() { if (existingLocation) return; closeProvinceDivider(false); setTool(null); setDrawing(false); setError(""); setPickMenu(null); setStatus("Auswahlwerkzeug aktiv. Sichtbarkeit und Auswahlfilter lassen sich getrennt einstellen."); }
  function layerForRole(role: string) { return vectorLayers.find((layer) => layer.layer_role === role) ?? vectorLayers[0] ?? null; }
  function scheduleLayerPatch(id: number, patch: Record<string, unknown>) { const previous = saveTimers.current.get(id); if (previous) clearTimeout(previous); saveTimers.current.set(id, setTimeout(async () => { const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/layers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }); if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.error || "Kartenebene konnte nicht gespeichert werden."); } }, 280)); }

  function geometryForLocation(locationId: number | null | undefined) {
    if (!locationId) return null;
    for (const row of rowRefs.current.values()) {
      if (row.entity_type === "location" && Number(row.entity_id) === locationId && ["Polygon", "MultiPolygon"].includes(row.geometry.type)) return row.geometry as JsonMapGeometry;
    }
    return null;
  }

  function conformSemanticGeometry(geometry: JsonMapGeometry, kind: LocationKind | null, parentLocationId: number | null | undefined) {
    if (!["Polygon", "MultiPolygon"].includes(geometry.type)) return geometry;
    let result = geometry;
    if (kind === "country" && landMaskRef.current) result = clipPolygonToLandMask(result, landMaskRef.current);
    if ((kind === "province" || kind === "region") && parentLocationId) {
      const parent = geometryForLocation(parentLocationId);
      if (parent) result = conformPolygonToParent(result, parent, parentConformStep);
    }
    return result;
  }

  async function conformChildrenToParent(parentRow: WorldMapFeature, parentGeometry: JsonMapGeometry) {
    if (parentRow.entity_type !== "location" || !parentRow.entity_id || !["Polygon", "MultiPolygon"].includes(parentGeometry.type)) return 0;
    const parentLocationId = Number(parentRow.entity_id);
    if (!Number.isSafeInteger(parentLocationId) || parentLocationId <= 0) return 0;
    const ol = await ensureOpenLayers();
    const format = new ol.format.GeoJSON();
    let changed = 0;
    for (const [featureId, child] of rowRefs.current.entries()) {
      if (child.location_parent_id !== parentLocationId || !["province", "region"].includes(kindFromFeature(child) ?? "") || !["Polygon", "MultiPolygon"].includes(child.geometry.type)) continue;
      if (isMapFeatureEditorLocked(child)) continue;
      const next = conformPolygonToParent(child.geometry as JsonMapGeometry, parentGeometry, parentConformStep);
      if (geometryEqual(child.geometry as JsonMapGeometry, next)) continue;
      const feature = featureRefs.current.get(featureId);
      if (feature) feature.setGeometry(format.readGeometry(next));
      await patchGeometry(featureId, next);
      changed += 1;
    }
    return changed;
  }

  function beginDrawing() {
    if (!activeTool || !name.trim()) return;
    if (activeTool.kind === "province" && !parentId) {
      setError(existingLocation ? "Diese Provinz besitzt keine übergeordnete Location. Setze zuerst auf der Location-Seite ein Land oder eine Region als Parent." : "Wähle zuerst unter „Gehört zu“ das Land oder die Region der Provinz. Nur so kann WorldReborn die Außengrenze automatisch übernehmen.");
      return;
    }
    if ((activeTool.kind === "province" || activeTool.kind === "region") && parentId && !geometryForLocation(parentId)) {
      setError("Der übergeordnete Ort besitzt noch keine politische Fläche auf dieser Karte. Zeichne zuerst dessen Grenze.");
      return;
    }
    if (activeTool.kind === "country" && landMaskLayer && landMaskState === "loading") {
      setError("Die Rock-3-Land-Mask wird noch vorbereitet. Einen Moment warten und erneut versuchen.");
      return;
    }
    setError(""); setPickMenu(null); setDrawing(true);
  }

  async function patchGeometry(featureId: number, geometry: JsonMapGeometry) {
    setSaveState("saving");
    const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${featureId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patchType: "geometry", geometry }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Grenze konnte nicht gespeichert werden.");
    const row = rowRefs.current.get(featureId); if (row) row.geometry = geometry;
    setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1200);
  }

  async function patchGeometryBatch(featureId: number, geometry: JsonMapGeometry, peers: SharedBoundaryUpdate[]) {
    setSaveState("saving");
    const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${featureId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patchType: "geometry_batch", geometry, peers: peers.map((peer) => ({ featureId: peer.featureId, geometry: peer.geometry })) }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "Gemeinsame Grenze konnte nicht gespeichert werden.");
    const row = rowRefs.current.get(featureId); if (row) row.geometry = geometry;
    for (const peer of peers) { const peerRow = rowRefs.current.get(peer.featureId); if (peerRow) peerRow.geometry = peer.geometry; }
    setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1200);
  }

  async function patchStyle(featureId: number, style: Record<string, unknown>) {
    setSaveState("saving");
    const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${featureId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patchType: "style", style }) });
    const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Darstellung konnte nicht gespeichert werden.");
    const row = rowRefs.current.get(featureId); if (row) row.style = { ...row.style, ...style };
    setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1200);
  }

  async function patchMetadata(featureId: number, metadata: Record<string, unknown>) {
    setSaveState("saving");
    const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${featureId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patchType: "metadata", metadata }) });
    const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Bearbeitungsstatus konnte nicht gespeichert werden.");
    const row = rowRefs.current.get(featureId); if (row) row.metadata = { ...row.metadata, ...metadata };
    setFeatureRevision((value) => value + 1); setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1200);
  }

  function refreshFeaturePresentation(featureId: number) {
    const row = rowRefs.current.get(featureId), feature = featureRefs.current.get(featureId);
    if (!row) return;
    if (feature) feature.set("label", row.label);
    sourceRefs.current.get(Number(row.layer_id))?.changed();
    setFeatureRevision((value) => value + 1);
  }

  function queuePresentationPatch(featureId: number, patch: { label?: string; style?: Record<string, unknown> }, shouldSyncLoreName = false) {
    const row = rowRefs.current.get(featureId); if (!row) return;
    if (patch.label !== undefined) row.label = patch.label;
    if (patch.style) row.style = { ...row.style, ...patch.style, presentationVersion: 1 };
    refreshFeaturePresentation(featureId);

    const current = pendingPresentation.current.get(featureId) ?? { style: {}, syncLoreName: false };
    const next: PendingPresentation = {
      label: patch.label !== undefined ? patch.label : current.label,
      style: { ...current.style, ...(patch.style ?? {}), presentationVersion: 1 },
      syncLoreName: current.syncLoreName || (patch.label !== undefined && shouldSyncLoreName),
    };
    pendingPresentation.current.set(featureId, next);
    const previousTimer = presentationTimers.current.get(featureId); if (previousTimer) window.clearTimeout(previousTimer);
    setError(""); setSaveState("saving");
    presentationTimers.current.set(featureId, window.setTimeout(async () => {
      const payload = pendingPresentation.current.get(featureId); if (!payload) return;
      pendingPresentation.current.delete(featureId); presentationTimers.current.delete(featureId);
      try {
        const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${featureId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patchType: "presentation", label: payload.label, style: payload.style, syncLoreName: payload.syncLoreName }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.ok !== true) throw new Error(body.error || "Darstellung konnte nicht gespeichert werden.");
        const savedRow = rowRefs.current.get(featureId);
        if (savedRow) {
          if (typeof body.label === "string") savedRow.label = body.label;
          if (body.style && typeof body.style === "object") savedRow.style = body.style as Record<string, unknown>;
        }
        refreshFeaturePresentation(featureId);
        setSaveState("saved");
        setStatus(body.loreNameUpdated ? "Kartenlabel und Lore-Name wurden gespeichert." : "Kartendarstellung gespeichert.");
        window.setTimeout(() => setSaveState("idle"), 1200);
      } catch (cause) {
        setSaveState("idle");
        setError(`${cause instanceof Error ? cause.message : "Darstellung konnte nicht gespeichert werden."} Die lokale Vorschau ist noch sichtbar.`);
      }
    }, 420));
  }

  function updateSelectedStyle(style: Record<string, unknown>) {
    if (!selectedId) return;
    queuePresentationPatch(selectedId, { style });
  }

  function updateSelectedLabel(label: string) {
    if (!selectedId) return;
    queuePresentationPatch(selectedId, { label }, syncLoreName);
  }

  function updateHexStyle(key: "fill" | "stroke" | "labelColor" | "labelHalo", value: string, extra: Record<string, unknown> = {}) {
    if (!isHex(value)) { setError("Bitte eine vollständige Hex-Farbe wie #6879C9 eingeben."); return; }
    updateSelectedStyle({ [key]: value.toLowerCase(), ...extra });
  }

  function recolorSelectedChildren() {
    if (!selectedRow || !selectedPresentation || selectedChildren.length < 2) return;
    const next = nextPaletteSeed(paletteSeed); setPaletteSeed(next);
    const palette = generatePoliticalPalette({ baseColor: selectedPresentation.fill, count: selectedChildren.length, mode: "parent", seed: next });
    selectedChildren.forEach(([featureId], index) => queuePresentationPatch(featureId, { style: { fill: palette[index], autoStroke: true } }));
    setStatus(`${selectedChildren.length} Untergebiete erhalten eine neue harmonische Palette. Grenzen und Geometrien bleiben unverändert.`);
  }

  async function applyTopologyChange(featureId: number, before: JsonMapGeometry, edited: JsonMapGeometry, finalGeometry: JsonMapGeometry) {
    const row = rowRefs.current.get(featureId);
    if (!row) { await patchGeometry(featureId, finalGeometry); return { peerCount: 0, movedSharedVertices: 0, children: 0 }; }
    if (isMapFeatureEditorLocked(row)) throw new Error(`„${row.label}“ ist gesperrt. Entsperre die Grenze zuerst.`);
    const sync = synchronizeSharedPoliticalVertices({ changedFeatureId: featureId, changedRow: row, before, edited, peers: rowRefs.current.entries(), tolerance: topologyTolerance });
    if (sync.blockedBy.length) throw new Error(`Die gemeinsame Grenze berührt gesperrte Nachbarn: ${sync.blockedBy.join(", ")}. Entsperre sie zuerst oder bearbeite eine andere Grenze.`);

    const lockedChildren = new Set(lockedChildrenNeedingAdjustment(row, finalGeometry));
    for (const peer of sync.updates) {
      const peerRow = rowRefs.current.get(peer.featureId);
      if (peerRow) for (const label of lockedChildrenNeedingAdjustment(peerRow, peer.geometry)) lockedChildren.add(label);
    }
    if (lockedChildren.size) throw new Error(`Die Grenzänderung würde gesperrte Untergebiete verändern: ${[...lockedChildren].join(", ")}. Entsperre diese zuerst.`);

    await patchGeometryBatch(featureId, finalGeometry, sync.updates);
    const ol = await ensureOpenLayers();
    const format = new ol.format.GeoJSON();
    const primaryFeature = featureRefs.current.get(featureId); if (primaryFeature) primaryFeature.setGeometry(format.readGeometry(finalGeometry));
    let children = await conformChildrenToParent(row, finalGeometry);
    for (const peer of sync.updates) {
      const feature = featureRefs.current.get(peer.featureId); if (feature) feature.setGeometry(format.readGeometry(peer.geometry));
      const peerRow = rowRefs.current.get(peer.featureId); if (peerRow) children += await conformChildrenToParent(peerRow, peer.geometry);
    }
    return { peerCount: sync.updates.length, movedSharedVertices: sync.movedSharedVertices, children };
  }

  function focusFeature(id: number) {
    const row = rowRefs.current.get(id) ?? features.find((item) => Number(item.feature_id) === id);
    if (row && !contentVisibilityRef.current[featureContentCategory(row)]) { setStatus(`„${row.label}“ ist aktuell ausgeblendet. Aktiviere den Inhalt unter Sichtbarkeit.`); return false; }
    const feature = featureRefs.current.get(id), map = mapRef.current;
    if (!feature || !map) return false;
    const extent = feature.getGeometry()?.getExtent(); if (extent) map.getView().fit(extent, { padding: [90, 90, 90, 90], maxZoom: Math.min(mapConfig.maxZoom, 5), duration: 250 });
    selectFeature(id); return true;
  }

  useEffect(() => {
    let cancelled = false;
    landMaskRef.current = null;
    if (!landMaskLayer || mapConfig.mapType !== "image") { setLandMaskState("missing"); return; }
    setLandMaskState("loading");
    void loadLandMaskGuide(landMaskLayer, mapExtent).then((guide) => {
      if (cancelled) return;
      landMaskRef.current = guide;
      setLandMaskState(guide ? "ready" : "missing");
    }).catch(() => { if (!cancelled) setLandMaskState("error"); });
    return () => { cancelled = true; };
  }, [landMaskLayer, mapConfig.mapType, mapExtent]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`worldreborn:map-content:${mapConfig.mapId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<MapContentVisibility>;
        const next = { ...DEFAULT_MAP_CONTENT_VISIBILITY, ...parsed };
        contentVisibilityRef.current = next; setContentVisibility(next);
      }
      const savedScope = window.localStorage.getItem(`worldreborn:map-selection-scope:${mapConfig.mapId}`) as MapSelectionScope | null;
      if (savedScope && MAP_SELECTION_SCOPES.some((scope) => scope.id === savedScope)) { selectionScopeRef.current = savedScope; setSelectionScope(savedScope); }
      const savedAllLabels = window.localStorage.getItem(`worldreborn:map-all-labels:${mapConfig.mapId}`) === "1";
      showAllLabelsRef.current = savedAllLabels; setShowAllLabels(savedAllLabels);
    } catch { /* optional local preference */ }
  }, [mapConfig.mapId]);

  useEffect(() => {
    let active = true;
    ensureOpenLayers().then((ol) => {
      if (!active || !targetRef.current) return;
      sourceRefs.current.clear(); layerRefs.current.clear(); featureRefs.current.clear(); rowRefs.current.clear();
      const simple = mapConfig.mapType === "image", extent = mapExtent, projection = simple ? new ol.proj.Projection({ code: `WORLDREBORN:EDIT:${mapConfig.mapId}`, units: "pixels", extent }) : undefined, mapLayers: any[] = [];
      if (simple && mapConfig.imagePath) { const url = mediaMapUrl(mapConfig.imagePath); if (url) mapLayers.push(new ol.layer.Image({ zIndex: -1000, source: new ol.source.ImageStatic({ url, projection, imageExtent: extent }) })); }
      else if (mapConfig.tileUrl) mapLayers.push(new ol.layer.Tile({ zIndex: -1000, source: new ol.source.XYZ({ url: mapConfig.tileUrl, wrapX: false, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom }) }));
      for (const layer of rasterLayers) {
        const id = Number(layer.layer_id), isBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath); if (isBase) continue;
        const url = layer.source_type === "media" && layer.media_id ? `/api/media/${layer.media_id}` : layer.source_url; if (!url) continue;
        let rendered: any = null;
        if (simple && (layer.source_type === "media" || layer.source_type === "image")) rendered = new ol.layer.Image({ opacity: layer.opacity, zIndex: layer.z_index, visible: layer.visible_by_default, source: new ol.source.ImageStatic({ url, projection, imageExtent: extent }) });
        else if (layer.source_type === "tile") rendered = new ol.layer.Tile({ opacity: layer.opacity, zIndex: layer.z_index, visible: layer.visible_by_default, source: new ol.source.XYZ({ url, wrapX: false }) });
        if (rendered) { rendered.set("worldrebornLayerId", id); layerRefs.current.set(id, rendered); mapLayers.push(rendered); }
      }
      const geojson = new ol.format.GeoJSON();
      for (const layer of vectorLayers) {
        const id = Number(layer.layer_id), source = new ol.source.Vector(); sourceRefs.current.set(id, source);
        const rendered = new ol.layer.Vector({ source, zIndex: layer.z_index || 500, visible: layer.visible_by_default, opacity: layer.opacity, declutter: true, style: (feature: any) => {
          const row = rowRefs.current.get(Number(feature.get("featureId")));
          if (!row || !contentVisibilityRef.current[featureContentCategory(row)]) return null;
          return createMapFeatureStyle(ol, { row, layerStyle: layer.style, labelsEnabled: contentVisibilityRef.current.labels, zoom: mapRef.current?.getView().getZoom() ?? null, declutterLabels: !showAllLabelsRef.current, pointRadius: 7 });
        } });
        rendered.set("worldrebornLayerId", id); layerRefs.current.set(id, rendered); mapLayers.push(rendered);
        for (const row of features.filter((item) => Number(item.layer_id) === id)) {
          try { const featureId = Number(row.feature_id), feature = geojson.readFeature({ type: "Feature", geometry: row.geometry, properties: { featureId, label: row.label } }); source.addFeature(feature); featureRefs.current.set(featureId, feature); rowRefs.current.set(featureId, { ...row, style: { ...row.style }, metadata: { ...row.metadata } }); } catch { /* malformed legacy geometry remains isolated */ }
        }
      }

      const highlightSource = new ol.source.Vector();
      const highlightLayer = new ol.layer.Vector({ source: highlightSource, zIndex: 100000, style: (feature: any) => {
        const selected = feature.get("visualState") === "selected", locked = feature.get("locked") === true;
        const type = feature.getGeometry()?.getType() ?? "";
        const accent = locked ? "#e49a69" : "#f0ce7d";
        return new ol.style.Style({
          fill: type.includes("Polygon") ? new ol.style.Fill({ color: selected ? (locked ? "rgba(228,154,105,.11)" : "rgba(224,194,118,.10)") : "rgba(255,255,255,.035)" }) : undefined,
          stroke: new ol.style.Stroke({ color: selected ? accent : "rgba(255,255,255,.92)", width: selected ? 4 : 2.5, lineDash: selected && !locked ? undefined : [7, 5] }),
          image: new ol.style.Circle({ radius: selected ? 10 : 9, fill: new ol.style.Fill({ color: selected ? accent : "#f5f5f5" }), stroke: new ol.style.Stroke({ color: "#10141a", width: 3 }) }),
        });
      } });
      mapLayers.push(highlightLayer);

      const view = simple ? new ol.View({ projection, center: ol.extent.getCenter(extent), zoom: 0, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom, extent }) : new ol.View({ center: ol.proj.fromLonLat([mapConfig.centerLng ?? 0, mapConfig.centerLat ?? 0]), zoom: Math.max(mapConfig.minZoom, 2), minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom });
      const map = new ol.Map({ target: targetRef.current, layers: mapLayers, view }); mapRef.current = map; if (simple) view.fit(extent, { padding: [20, 20, 20, 20] });

      let highlightedSelected: number | null = null, highlightedHover: number | null = null;
      const renderHighlights = () => {
        highlightSource.clear();
        const add = (id: number | null, visualState: "selected" | "hover") => {
          if (!id) return;
          const row = rowRefs.current.get(id); if (row && !contentVisibilityRef.current[featureContentCategory(row)]) return;
          const original = featureRefs.current.get(id); if (!original?.getGeometry()) return;
          highlightSource.addFeature(new ol.Feature({ geometry: original.getGeometry(), visualState, locked: Boolean(row && isMapFeatureEditorLocked(row)) }));
        };
        add(highlightedSelected, "selected"); if (highlightedHover !== highlightedSelected) add(highlightedHover, "hover");
      };
      highlightRef.current = {
        select(id) { highlightedSelected = id; if (id === highlightedHover) highlightedHover = null; renderHighlights(); },
        hover(id) { highlightedHover = id === highlightedSelected ? null : id; renderHighlights(); },
        clear() { highlightedSelected = null; highlightedHover = null; renderHighlights(); },
      };

      const select = new ol.interaction.Select({ style: null, hitTolerance: 12, layers: (candidate: any) => Boolean(candidate.get("worldrebornLayerId")) && sourceRefs.current.has(Number(candidate.get("worldrebornLayerId"))) });
      select.setActive(false); selectRef.current = select; map.addInteraction(select);
      const modify = new ol.interaction.Modify({ features: select.getFeatures(), pixelTolerance: 16 }); modifyRef.current = modify; map.addInteraction(modify);

      const collectCandidates = (pixel: number[]) => {
        const seen = new Set<number>(), candidates: MapSelectionCandidate[] = [];
        map.forEachFeatureAtPixel(pixel, (feature: any) => {
          const featureId = Number(feature.get("featureId")); if (!featureId || seen.has(featureId)) return undefined;
          const row = rowRefs.current.get(featureId);
          if (!row || !contentVisibilityRef.current[featureContentCategory(row)] || !selectionScopeMatchesFeature(selectionScopeRef.current, row)) return undefined;
          seen.add(featureId);
          const featureExtent = feature.getGeometry()?.getExtent();
          const extentArea = featureExtent ? Math.max(0, (featureExtent[2] - featureExtent[0]) * (featureExtent[3] - featureExtent[1])) : 0;
          candidates.push(selectionCandidateFromRow(featureId, row, extentArea)); return undefined;
        }, { hitTolerance: 12, layerFilter: (candidate: any) => Boolean(candidate.get("worldrebornLayerId")) && sourceRefs.current.has(Number(candidate.get("worldrebornLayerId"))) });
        return rankSelectionCandidates(candidates);
      };

      const singleClick = (event: any) => {
        if (drawRef.current || dividerFeatureIdRef.current) return;
        const candidates = collectCandidates(event.pixel);
        if (!candidates.length) { selectFeature(null); return; }
        if (candidates.length === 1) { selectFeature(candidates[0].featureId); return; }
        const width = targetRef.current?.clientWidth ?? 800, height = targetRef.current?.clientHeight ?? 600;
        setPickMenu({ x: Math.max(58, Math.min(event.pixel[0] + 14, width - 286)), y: Math.max(58, Math.min(event.pixel[1] + 14, height - 250)), items: candidates.slice(0, 10) });
        setStatus(`${candidates.length} passende Objekte liegen hier. Wähle gezielt das gewünschte Element.`);
      };
      const pointerMove = (event: any) => {
        if (event.dragging || drawRef.current || dividerFeatureIdRef.current) return;
        const candidate = collectCandidates(event.pixel)[0] ?? null; highlightRef.current?.hover(candidate?.featureId ?? null);
        const element = map.getTargetElement(); if (element) element.style.cursor = candidate ? "pointer" : "";
      };
      map.on("singleclick", singleClick); map.on("pointermove", pointerMove);

      modify.on("modifystart", (event: any) => { for (const feature of event.features.getArray()) { const id = Number(feature.get("featureId")); if (id) beforeGeometry.current.set(id, geojson.writeGeometryObject(feature.getGeometry()) as JsonMapGeometry); } });
      modify.on("modifyend", async (event: any) => {
        setError("");
        for (const feature of event.features.getArray()) {
          const id = Number(feature.get("featureId")); if (!id) continue;
          const row = rowRefs.current.get(id), before = beforeGeometry.current.get(id);
          if (!row || !before) continue;
          try {
            const rawAfter = geojson.writeGeometryObject(feature.getGeometry()) as JsonMapGeometry;
            const parentLocationId = row.location_parent_id ?? (typeof row.metadata?.parentLocationId === "number" ? row.metadata.parentLocationId : null);
            const after = conformSemanticGeometry(rawAfter, kindFromFeature(row), parentLocationId);
            const result = await applyTopologyChange(id, before, rawAfter, after);
            feature.setGeometry(geojson.readGeometry(after));
            setUndoStack((current) => [...current.slice(-29), { featureId: id, before, after, label: row.label ?? "Element" }]); setRedoStack([]);
            beforeGeometry.current.delete(id); highlightRef.current?.select(id);
            const topologyMessage = result.peerCount ? ` ${result.peerCount} Nachbarfläche${result.peerCount === 1 ? " wurde" : "n wurden"} an der gemeinsamen Grenze synchronisiert.` : "";
            const childMessage = result.children ? ` ${result.children} untergeordnete Fläche${result.children === 1 ? " wurde" : "n wurden"} angepasst.` : "";
            setStatus(`Grenze aktualisiert.${topologyMessage}${childMessage}`);
          } catch (cause) {
            feature.setGeometry(geojson.readGeometry(before)); beforeGeometry.current.delete(id); highlightRef.current?.select(id);
            setError(cause instanceof Error ? cause.message : "Änderung konnte nicht gespeichert werden.");
          }
        }
      });
      for (const source of sourceRefs.current.values()) map.addInteraction(new ol.interaction.Snap({ source, pixelTolerance: 16 }));
      if (focusFeatureId) window.setTimeout(() => focusFeature(focusFeatureId), 0);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Karte konnte nicht geladen werden."));
    return () => {
      active = false; dividerFeatureIdRef.current = null;
      for (const timer of saveTimers.current.values()) clearTimeout(timer); saveTimers.current.clear();
      for (const timer of presentationTimers.current.values()) clearTimeout(timer); presentationTimers.current.clear(); pendingPresentation.current.clear();
      highlightRef.current?.clear(); highlightRef.current = null; mapRef.current?.setTarget(undefined); mapRef.current = null; sourceRefs.current.clear(); layerRefs.current.clear(); featureRefs.current.clear(); rowRefs.current.clear();
    };
  }, [mapConfig, mapExtent, rasterLayers, vectorLayers, features, focusFeatureId, topologyTolerance]);

  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    ensureOpenLayers().then((ol) => {
      if (drawRef.current) { map.removeInteraction(drawRef.current); drawRef.current = null; }
      modifyRef.current?.setActive(!drawing); if (!drawing || !activeTool) return;
      highlightRef.current?.hover(null); setPickMenu(null);
      const layer = layerForRole(activeTool.role); if (!layer) { setError("Für dieses Werkzeug fehlt eine passende Inhaltsebene."); setDrawing(false); return; }
      const source = sourceRefs.current.get(Number(layer.layer_id)); if (!source) return;
      const draw = new ol.interaction.Draw({ source, type: activeTool.mode, snapTolerance: 16, trace: activeTool.mode !== "Point", traceSource: source }); drawRef.current = draw; map.addInteraction(draw);
      draw.on("drawend", async (event: any) => {
        setError(""); setSaveState("saving");
        try {
          const geojson = new ol.format.GeoJSON(), rawGeometry = geojson.writeGeometryObject(event.feature.getGeometry()) as JsonMapGeometry, constraintParentId = parentId;
          const geometry = conformSemanticGeometry(rawGeometry, activeTool.kind, constraintParentId); if (!geometryEqual(geometry, rawGeometry)) event.feature.setGeometry(geojson.readGeometry(geometry));
          const baseStyle = defaultFeaturePresentationStyle(activeTool.kind, color, activeTool.mode);
          const style = activeTool.mode === "LineString" ? { ...baseStyle, fill: color, stroke: color, autoStroke: false, strokeWidth: 3 } : baseStyle;
          const linkedLocationId = existingLocation?.id ?? null;
          const metadata = { createdIn: "map-editor-v11", tool, existingLocationId: linkedLocationId, parentLocationId: constraintParentId, geometryConformance: activeTool.kind === "country" ? "land-mask-raster-clip" : constraintParentId ? "parent-polygon" : "none", editorLocked: false };
          const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layerId: Number(layer.layer_id), geometry, entityType: linkedLocationId ? "location" : null, entityId: linkedLocationId, label: name.trim(), visibilityMode: "admin_only", selectedPlayerIds: [], style, metadata, createLocation: !linkedLocationId && activeTool.kind ? { kind: activeTool.kind, parentLocationId: parentId, locationType: locationKindLabel(activeTool.kind) } : null }) });
          const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || "Element konnte nicht gespeichert werden.");
          const featureId = Number(body.featureId), locationId = linkedLocationId ?? (body.locationId ? Number(body.locationId) : null);
          const row: WorldMapFeature = { feature_id: String(featureId), layer_id: String(layer.layer_id), geometry, entity_type: locationId ? "location" : null, entity_id: locationId ? String(locationId) : null, label: name.trim(), short_description: null, visibility_mode: "admin_only", style, metadata, location_parent_id: constraintParentId, location_kind: activeTool.kind };
          rowRefs.current.set(featureId, row); featureRefs.current.set(featureId, event.feature); event.feature.set("featureId", featureId); event.feature.set("label", row.label); source.changed(); selectFeature(featureId); setDrawing(false); if (!existingLocation) { setName(""); setParentId(null); } setSaveState("saved");
          if (activeTool.kind === "country" && landMaskRef.current) setStatus(`Land „${row.label}“ wurde hochauflösend mit der Rock-3-Landmaske verschnitten.`);
          else if ((activeTool.kind === "province" || activeTool.kind === "region") && constraintParentId) setStatus(`${activeTool.label} „${row.label}“ wurde an die übergeordnete politische Grenze angepasst.`);
          else setStatus(existingLocation ? `„${existingLocation.name}“ wurde auf der Karte platziert.` : `${activeTool.label} „${row.label}“ wurde erstellt.`);
          window.setTimeout(() => setSaveState("idle"), 1200);
        } catch (cause) { source.removeFeature(event.feature); setSaveState("idle"); setError(cause instanceof Error ? cause.message : "Element konnte nicht gespeichert werden."); setDrawing(false); }
      });
    });
    return () => { if (drawRef.current) { map.removeInteraction(drawRef.current); drawRef.current = null; } modifyRef.current?.setActive(true); };
  }, [drawing, activeTool, name, color, parentId, projectId, mapConfig.mapId, tool, vectorLayers, existingLocation, landMaskState, parentConformStep]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (drawing) { setDrawing(false); setStatus("Zeichnen abgebrochen."); return; }
      if (dividerFeatureIdRef.current) { const previous = dividerFeatureIdRef.current; dividerFeatureIdRef.current = null; setDividerFeatureId(null); if (previous) selectFeature(previous); setStatus("Provinz-Teilung geschlossen."); return; }
      if (pickMenu) { setPickMenu(null); return; }
      selectFeature(null); setStatus("Auswahl aufgehoben.");
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawing, pickMenu]);

  useEffect(() => { const term = query.trim(); if (term.length < 2) { setSearchResults([]); return; } const controller = new AbortController(); const timer = window.setTimeout(async () => { setSearching(true); try { const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/search?q=${encodeURIComponent(term)}`, { signal: controller.signal }); const body = await response.json().catch(() => ({})); if (response.ok) setSearchResults(Array.isArray(body.items) ? body.items : []); } finally { setSearching(false); } }, 180); return () => { controller.abort(); window.clearTimeout(timer); }; }, [query, projectId, mapConfig.mapId]);

  async function deleteSelected() {
    if (!selectedId || deletingId) return;
    const featureId = selectedId, row = rowRefs.current.get(featureId); if (!row) return;
    if (isMapFeatureEditorLocked(row)) { setError(`„${row.label}“ ist gesperrt. Entsperre das Element vor dem Löschen.`); return; }
    if (!window.confirm(`„${row.label}“ wirklich von der Karte entfernen? Die verknüpfte Location bleibt bestehen.`)) return;
    setDeletingId(featureId); setError(""); setStatus(`„${row.label}“ wird entfernt …`);
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${featureId}`, { method: "DELETE", headers: { Accept: "application/json" } });
      const body = await response.json().catch(() => ({})); if (!response.ok || body.ok !== true) throw new Error(body.error || "Element konnte nicht entfernt werden.");
      selectRef.current?.getFeatures().clear(); highlightRef.current?.select(null);
      const source = sourceRefs.current.get(Number(row.layer_id)), feature = featureRefs.current.get(featureId); if (source && feature) { source.removeFeature(feature); source.changed(); }
      featureRefs.current.delete(featureId); rowRefs.current.delete(featureId); beforeGeometry.current.delete(featureId);
      setUndoStack((current) => current.filter((entry) => entry.featureId !== featureId)); setRedoStack((current) => current.filter((entry) => entry.featureId !== featureId));
      setSelectedId(null); setPickMenu(null); setStatus(`„${row.label}“ wurde von der Karte entfernt. Die Lore-Location bleibt erhalten.`); setSaveState("saved"); window.setTimeout(() => setSaveState("idle"), 1200);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Element konnte nicht entfernt werden."); setStatus("Löschen fehlgeschlagen."); }
    finally { setDeletingId(null); }
  }

  async function reconformSelected() {
    if (!selectedId) return;
    const row = rowRefs.current.get(selectedId), feature = featureRefs.current.get(selectedId); if (!row || !feature) return;
    if (isMapFeatureEditorLocked(row)) { setError(`„${row.label}“ ist gesperrt. Entsperre die Grenze zuerst.`); return; }
    const kind = kindFromFeature(row), parentLocationId = row.location_parent_id ?? (typeof row.metadata?.parentLocationId === "number" ? row.metadata.parentLocationId : null);
    if (kind === "country" && landMaskLayer && landMaskState !== "ready") { setError("Die Rock-3-Land-Mask ist noch nicht bereit."); return; }
    if ((kind === "province" || kind === "region") && (!parentLocationId || !geometryForLocation(parentLocationId))) { setError("Für diese Fläche ist keine gezeichnete übergeordnete politische Grenze verfügbar."); return; }
    try {
      setError(""); setSaveState("saving"); const before = row.geometry as JsonMapGeometry, next = conformSemanticGeometry(before, kind, parentLocationId);
      if (geometryEqual(before, next)) { setStatus(`„${row.label}“ liegt bereits innerhalb der gültigen Grenze.`); setSaveState("idle"); return; }
      const lockedChildren = lockedChildrenNeedingAdjustment(row, next);
      if (lockedChildren.length) throw new Error(`Die Anpassung würde gesperrte Untergebiete verändern: ${lockedChildren.join(", ")}. Entsperre diese zuerst.`);
      const ol = await ensureOpenLayers(); feature.setGeometry(new ol.format.GeoJSON().readGeometry(next)); await patchGeometry(selectedId, next); highlightRef.current?.select(selectedId);
      const children = await conformChildrenToParent(row, next);
      setStatus(children ? `„${row.label}“ wurde angepasst; ${children} untergeordnete Fläche${children===1?" wurde":"n wurden"} ebenfalls aktualisiert.` : kind === "country" ? `„${row.label}“ wurde vollständig mit der hochauflösenden Rock-3-Landmaske verschnitten.` : `„${row.label}“ wurde an die gültige Grenze angepasst.`);
    } catch (cause) { setSaveState("idle"); setError(cause instanceof Error ? cause.message : "Geometrie konnte nicht angepasst werden."); }
  }

  async function toggleSelectedLock() {
    if (!selectedId) return; const row = rowRefs.current.get(selectedId); if (!row) return;
    const next = !isMapFeatureEditorLocked(row);
    try { await patchMetadata(selectedId, { editorLocked: next }); selectFeature(selectedId); highlightRef.current?.select(selectedId); setStatus(next ? `„${row.label}“ ist jetzt gegen Verschieben und Löschen gesperrt.` : `„${row.label}“ kann wieder bearbeitet werden.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sperre konnte nicht geändert werden."); }
  }

  async function applyHistory(entry: HistoryEntry, direction: "undo" | "redo") {
    const target = direction === "undo" ? entry.before : entry.after, row = rowRefs.current.get(entry.featureId), feature = featureRefs.current.get(entry.featureId); if (!row || !feature) return;
    const current = row.geometry as JsonMapGeometry;
    await applyTopologyChange(entry.featureId, current, target, target);
    const ol = await ensureOpenLayers(); feature.setGeometry(new ol.format.GeoJSON().readGeometry(target)); sourceRefs.current.get(Number(row.layer_id))?.changed(); focusFeature(entry.featureId);
  }
  async function undo() { const entry = undoStack.at(-1); if (!entry) return; try { await applyHistory(entry, "undo"); setUndoStack((current) => current.slice(0, -1)); setRedoStack((current) => [...current, entry]); setStatus(`Änderung an „${entry.label}“ einschließlich gemeinsamer Grenzen rückgängig gemacht.`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Rückgängig fehlgeschlagen."); } }
  async function redo() { const entry = redoStack.at(-1); if (!entry) return; try { await applyHistory(entry, "redo"); setRedoStack((current) => current.slice(0, -1)); setUndoStack((current) => [...current, entry]); setStatus(`Änderung an „${entry.label}“ einschließlich gemeinsamer Grenzen wiederhergestellt.`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Wiederholen fehlgeschlagen."); } }
  function toggleLayer(layer: WorldMapLayer, visible: boolean) { layerRefs.current.get(Number(layer.layer_id))?.setVisible(visible); scheduleLayerPatch(Number(layer.layer_id), { visibleByDefault: visible }); setActiveView("custom"); }
  function setOpacity(layer: WorldMapLayer, value: number) { layerRefs.current.get(Number(layer.layer_id))?.setOpacity(value); scheduleLayerPatch(Number(layer.layer_id), { opacity: value }); }
  function applyView(view: string) { setActiveView(view); for (const layer of layers) { const id = Number(layer.layer_id), ref = layerRefs.current.get(id); if (!ref) continue; let visible = layer.visible_by_default; if (view === "political") visible = layer.layer_type === "vector" && ["political", "settlements"].includes(layer.layer_role ?? ""); if (view === "climate") visible = layer.layer_role === "biomes" || (layer.layer_type === "vector" && layer.layer_role === "political"); if (view === "rainfall") visible = layer.layer_role === "rainfall_annual" || (layer.layer_type === "vector" && layer.layer_role === "political"); if (view === "topography") visible = ["elevation_full", "elevation_land", "land_mask"].includes(layer.layer_role ?? "") || (layer.layer_type === "vector" && layer.layer_role === "political"); ref.setVisible(visible); const checkbox = document.querySelector<HTMLInputElement>(`[data-editor-layer="${id}"]`); if (checkbox) checkbox.checked = visible; } }
  function chooseSearch(item: MapSearchItem) { if (item.featureId && focusFeature(item.featureId)) { setQuery(""); setSearchResults([]); return; } if (item.markerId) { window.location.assign(`/admin/projects/${projectId}/map?mapId=${mapConfig.mapId}&markerId=${item.markerId}`); return; } if (item.href) window.location.assign(item.href); }

  const provinceNeedsParent = activeTool?.kind === "province";
  const countryMaskMessage = activeTool?.kind === "country" && landMaskLayer ? (landMaskState === "ready" ? "Land-Mask-Clipping aktiv: Wasser wird hochauflösend entfernt; die erzeugte Küste wird anschließend subpixel-tolerant geglättet." : landMaskState === "loading" ? "Land-Mask wird hochauflösend vorbereitet …" : "Land-Mask konnte nicht als Geometrie-Führung geladen werden.") : null;
  const canReconformSelected = selectedRow && ["country", "province", "region"].includes(selectedKind ?? "") && ["Polygon", "MultiPolygon"].includes(selectedRow.geometry.type);
  const canSplitSelected = selectedRow && ["country", "province", "region"].includes(selectedKind ?? "") && ["Polygon", "MultiPolygon"].includes(selectedRow.geometry.type) && selectedRow.entity_type === "location" && Boolean(selectedRow.entity_id);
  const editorContentFilters = MAP_CONTENT_FILTERS.filter((filter) => filter.id !== "markers");

  return <div className={styles.workspace} style={{ height }}>
    <div ref={targetRef} className={styles.canvas}/>

    {dividerRow && mapRef.current ? <ProvinceDividerTool projectId={projectId} mapId={mapConfig.mapId} map={mapRef.current} row={dividerRow} hasProvinceChildren={featureHasProvinceChildren(dividerRow)} onClose={() => closeProvinceDivider(true)}/> : null}

    {pickMenu ? <div className={`${styles.searchResults} ${styles.glass}`} style={{ top: pickMenu.y, left: pickMenu.x, right: "auto", width: 272, zIndex: 45 }}>
      <div className={styles.noResults}><strong>{pickMenu.items.length} Elemente hier</strong><br/>Wähle das Objekt, das du bearbeiten möchtest.</div>
      {pickMenu.items.map((candidate) => <button key={candidate.featureId} type="button" className={styles.searchResult} onClick={() => selectFeature(candidate.featureId)}><span className={styles.searchResultMain}><strong>{candidate.label}</strong><small>{candidateKindLabel(candidate)}</small></span><span className={styles.resultKind}>{geometryLabel(candidate.geometryType)}</span></button>)}
    </div> : null}

    <div className={styles.topSearch}>
      <div className={`${styles.searchShell} ${styles.glass}`}><span className={styles.searchIcon} aria-hidden="true">⌕</span><input className={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Land, Stadt, NPC oder Marker suchen …" aria-label="In dieser Welt suchen"/>{searching ? <span className={styles.searchBusy}>Suche …</span> : null}</div>
      {query.trim() ? <div className={`${styles.searchResults} ${styles.glass}`}>{searchResults.length ? searchResults.map((item, index) => <button key={`${item.kind}-${item.id}-${index}`} type="button" className={styles.searchResult} onClick={() => chooseSearch(item)}><span className={styles.searchResultMain}><strong>{item.name}</strong>{item.subtitle ? <small>{item.subtitle}</small> : null}</span><span className={styles.resultKind}>{searchKindLabel(item.kind)}</span></button>) : !searching ? <div className={styles.noResults}>Keine Treffer auf dieser Karte.</div> : null}</div> : null}
    </div>

    <div className={`${styles.toolRail} ${styles.glass}`} aria-label="Zeichenwerkzeuge">
      <button type="button" className={`${styles.toolButton}${!tool ? ` ${styles.toolButtonActive}` : ""}`} onClick={chooseSelect} disabled={Boolean(existingLocation)} aria-label="Auswählen"><span aria-hidden="true">↖</span><span className={styles.toolLabel}>Auswählen</span></button>
      <div className={styles.toolDivider}/>
      {(Object.keys(TOOLS) as ToolId[]).map((id) => <button key={id} type="button" className={`${styles.toolButton}${tool === id ? ` ${styles.toolButtonActive}` : ""}`} onClick={() => chooseTool(id)} disabled={Boolean(existingLocation && tool !== id)} aria-label={TOOLS[id].label}><span aria-hidden="true">{TOOLS[id].icon}</span><span className={styles.toolLabel}>{TOOLS[id].label}</span></button>)}
    </div>

    {activeTool && !dividerRow ? <aside className={`${styles.createPanel} ${styles.glass}`}>
      <div className={styles.panelHeader}><div><span className={styles.kicker}>{existingLocation ? "ORT PLATZIEREN" : "ERSTELLEN"}</span><h3 className={styles.panelTitle}>{existingLocation ? existingLocation.name : activeTool.label}</h3><p className={styles.panelText}>{existingLocation ? `Bestehende ${locationKindLabel(existingLocation.kind)}-Location – es wird nur die Kartenform ergänzt.` : activeTool.description}</p></div>{!existingLocation ? <button type="button" className={styles.closeButton} onClick={chooseSelect} aria-label="Werkzeug schließen">×</button> : null}</div>
      <div className={styles.fieldStack}>
        <label className={styles.field}>Name<input value={name} onChange={(event) => setName(event.target.value)} readOnly={Boolean(existingLocation)} placeholder={`Name für ${activeTool.label}`}/></label>
        <label className={styles.field}>Farbe<div className={styles.colorRow}><input type="color" value={color} onChange={(event) => setColor(event.target.value)}/><span className={styles.colorValue}>{color}</span></div></label>
        {!existingLocation && activeTool.kind ? <MapLocationPicker projectId={projectId} parentFor={activeTool.kind} value={parentId} onChange={(id) => { setParentId(id); setError(""); }}/> : null}
        {provinceNeedsParent && !parentId ? <div className={styles.drawHint}>{existingLocation?"Diese Provinz hat keine Parent-Location. Setze zuerst auf der Location-Seite ein Land oder eine Region als Parent.":"Eine Provinz braucht ein übergeordnetes Land oder eine Region. Deren Polygon wird als harte Außengrenze verwendet."}</div> : null}
        {countryMaskMessage ? <div className={styles.drawHint}>{countryMaskMessage}</div> : null}
        <button type="button" className={`button primary ${styles.primaryAction}`} disabled={!name.trim() || drawing || (provinceNeedsParent && !parentId)} onClick={beginDrawing}>{drawing ? "Zeichnen läuft …" : "Zeichnen beginnen"}</button>
        {drawing ? <div className={styles.drawHint}>{activeTool.mode === "Polygon" ? activeTool.kind === "country" ? "Zeichne das gewünschte Gebiet grob über Küsten und Inseln. Nach Abschluss wird es mit der Landmaske verschnitten und geglättet." : "Klicke entlang der Grenze. Am Startpunkt schließen. Die Fläche bleibt innerhalb ihrer übergeordneten politischen Grenze." : activeTool.mode === "Point" ? "Klicke auf die gewünschte Position." : "Klicke entlang des Verlaufs. Doppelklick beendet die Linie."}</div> : null}
      </div>
    </aside> : null}

    <div className={styles.actionDock}>
      <button type="button" className={`${styles.iconAction} ${styles.iconActionSquare} ${styles.glass}`} disabled={!undoStack.length || Boolean(dividerRow)} onClick={() => void undo()} aria-label="Rückgängig" title="Rückgängig">↶</button>
      <button type="button" className={`${styles.iconAction} ${styles.iconActionSquare} ${styles.glass}`} disabled={!redoStack.length || Boolean(dividerRow)} onClick={() => void redo()} aria-label="Wiederholen" title="Wiederholen">↷</button>
      <button type="button" className={`${styles.iconAction} ${styles.glass}${layersOpen ? ` ${styles.actionActive}` : ""}`} disabled={Boolean(dividerRow)} onClick={() => setLayersOpen((value) => !value)} aria-expanded={layersOpen}>☷ Sichtbarkeit</button>
    </div>

    {layersOpen && !dividerRow ? <aside className={`${styles.layerDrawer} ${styles.glass}`}>
      <div className={styles.drawerHeader}><div><strong>Sichtbarkeit & Auswahl</strong><span>Sehen, auswählen und bearbeiten getrennt steuern</span></div><button type="button" className={styles.closeButton} onClick={() => setLayersOpen(false)} aria-label="Sichtbarkeit schließen">×</button></div>
      <div className={styles.layerList}>
        <div>
          <div className={styles.layerSection}>Auswählen</div>
          <div className="row" style={{ gap: 5, padding: "5px 8px 9px", flexWrap: "wrap" }}>
            {MAP_SELECTION_SCOPES.map((scope) => <button key={scope.id} type="button" title={scope.hint} className={`button ghost${selectionScope === scope.id ? " active" : ""}`} style={{ minHeight: 28, height: 28, padding: "0 8px", fontSize: 9, borderColor: selectionScope === scope.id ? "rgba(199,164,93,.55)" : undefined, color: selectionScope === scope.id ? "#efd185" : undefined }} onClick={() => changeSelectionScope(scope.id)}>{scope.label}</button>)}
          </div>
        </div>
        <div>
          <div className={styles.layerSection}>Karteninhalte</div>
          <div className="row" style={{ gap: 6, padding: "4px 8px 7px" }}>
            <button type="button" className="button ghost" style={{ minHeight: 28, height: 28, padding: "0 8px", fontSize: 9 }} onClick={() => refreshContentVisibility(allContentVisibility(true))}>Alle an</button>
            <button type="button" className="button ghost" style={{ minHeight: 28, height: 28, padding: "0 8px", fontSize: 9 }} onClick={() => refreshContentVisibility(allContentVisibility(false))}>Alle aus</button>
          </div>
          {editorContentFilters.map((filter) => <div className={styles.layerRow} key={filter.id}>
            <div className={styles.layerInfo}><strong>{filter.icon} {filter.label}</strong><small>{filter.hint}</small></div>
            <div className={styles.layerControl}><input type="checkbox" checked={contentVisibility[filter.id]} onChange={(event) => toggleContent(filter.id, event.target.checked)} aria-label={`${filter.label} ein- oder ausblenden`}/></div>
          </div>)}
          <div className={styles.layerRow}><div className={styles.layerInfo}><strong>Alle Labels zeigen</strong><small>Im Editor Kollisionsausblendung temporär umgehen.</small></div><div className={styles.layerControl}><input type="checkbox" checked={showAllLabels} disabled={!contentVisibility.labels} onChange={(event) => toggleAllLabels(event.target.checked)} aria-label="Alle Labels im Editor zeigen"/></div></div>
        </div>
        {groupedLayers.map(([group, rows]) => <div key={group}><div className={styles.layerSection}>{group}</div>{rows.map((layer) => { const id = Number(layer.layer_id), isBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath); return <div className={styles.layerRow} key={id}><div className={styles.layerInfo}><strong>{layer.name}</strong><small>{isBase ? "Basiskarte" : layer.layer_type === "vector" ? "Eigene Inhalte" : "Rock-3-Daten"}</small></div><div className={styles.layerControl}><input data-editor-layer={id} type="checkbox" defaultChecked={isBase || layer.visible_by_default} disabled={isBase} onChange={(event) => toggleLayer(layer, event.target.checked)} aria-label={`${layer.name} ein- oder ausblenden`}/></div>{!isBase ? <label className={styles.opacityRow}><span>Deckkraft</span><input type="range" min="0" max="1" step="0.05" defaultValue={layer.opacity} onChange={(event) => setOpacity(layer, Number(event.target.value))}/></label> : null}</div>; })}</div>)}
      </div>
    </aside> : null}

    {!dividerRow ? <div className={`${styles.viewSwitcher} ${styles.glass}`}>{VIEWS.map(([id, label]) => <button key={id} type="button" className={`${styles.viewButton}${activeView === id ? ` ${styles.viewActive}` : ""}`} onClick={() => applyView(id)}>{label}</button>)}</div> : null}

    {selectedRow && selectedPresentation && !dividerRow ? <aside className={`${styles.inspector} ${styles.glass}`}>
      <div className={styles.panelHeader}><div><span className={styles.kicker}>AUSGEWÄHLT · DARSTELLUNG</span><h3 className={styles.panelTitle}>{selectedRow.label || "Ohne Label"}</h3></div><button type="button" className={styles.closeButton} onClick={() => selectFeature(null)} aria-label="Auswahl schließen">×</button></div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}><span className={styles.inspectorBadge}>{selectedKind ? locationKindLabel(selectedKind) : geometryLabel(selectedRow.geometry.type)}</span>{selectedLocked ? <span className={styles.inspectorBadge}>🔒 Geometrie gesperrt</span> : null}</div>

      <div className={styles.presentationSection}>
        <div className={styles.presentationHeading}><strong>Kartenlabel</strong><span>Unabhängig vom Lore-Namen</span></div>
        <label className={styles.field}>Label auf Karte<input key={`label-${selectedId}`} value={selectedRow.label} maxLength={200} onChange={(event) => updateSelectedLabel(event.target.value)} /></label>
        <label className={styles.checkRow}><input type="checkbox" checked={selectedPresentation.labelVisible} onChange={(event) => updateSelectedStyle({ labelVisible: event.target.checked })}/><span>Label anzeigen</span></label>
        {selectedRow.entity_type === "location" && selectedRow.entity_id ? <label className={styles.checkRow}><input type="checkbox" checked={syncLoreName} onChange={(event) => setSyncLoreName(event.target.checked)}/><span>Auch Lore-Name der Location ändern</span></label> : null}
        {syncLoreName ? <div className={styles.drawHint}>Neue Labeländerungen benennen auch die verknüpfte Location um. Das wirkt sich auf Listen, NPC-Verknüpfungen und andere WorldReborn-Bereiche aus.</div> : null}
        <div className={styles.twoFields}>
          <label className={styles.field}>Textfarbe<div className={styles.colorRow}><input type="color" value={selectedPresentation.labelColor} onChange={(event) => updateSelectedStyle({ labelColor: event.target.value })}/><span className={styles.colorValue}>{selectedPresentation.labelColor}</span></div></label>
          <label className={styles.field}>Größe <span className={styles.colorValue}>{selectedPresentation.labelSize}px</span><input type="range" min="8" max="40" step="1" value={selectedPresentation.labelSize} onChange={(event) => updateSelectedStyle({ labelSize: Number(event.target.value) })}/></label>
        </div>
      </div>

      <div className={styles.presentationSection}>
        <div className={styles.presentationHeading}><strong>{selectedRow.geometry.type.includes("Line") ? "Linie" : "Fläche & Grenze"}</strong><span>Live-Vorschau</span></div>
        {!selectedRow.geometry.type.includes("Line") ? <>
          <label className={styles.field}>Flächenfarbe<div className={styles.colorRow}><input type="color" value={selectedPresentation.fill} onChange={(event) => updateSelectedStyle({ fill: event.target.value })}/><input className={styles.hexInput} key={`fill-${selectedId}-${selectedPresentation.fill}`} defaultValue={selectedPresentation.fill} maxLength={7} onBlur={(event) => updateHexStyle("fill", event.target.value)}/></div></label>
          {selectedPolitical ? <div className={styles.colorSwatches}>{POLITICAL_COLOR_PRESETS.map((preset) => <button key={preset} type="button" aria-label={`Flächenfarbe ${preset}`} title={preset} style={{ background: preset }} onClick={() => updateSelectedStyle({ fill: preset })}/>)}</div> : null}
          <label className={styles.field}>Flächendeckkraft <span className={styles.colorValue}>{Math.round(selectedPresentation.fillOpacity * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={selectedPresentation.fillOpacity} onChange={(event) => updateSelectedStyle({ fillOpacity: Number(event.target.value) })}/></label>
        </> : null}
        <label className={styles.checkRow}><input type="checkbox" checked={selectedPresentation.autoStroke} onChange={(event) => updateSelectedStyle({ autoStroke: event.target.checked, stroke: event.target.checked ? automaticBorderColor(selectedPresentation.fill) : selectedPresentation.stroke })}/><span>Grenzfarbe automatisch aus Fläche ableiten</span></label>
        <label className={styles.field}>Grenzfarbe<div className={styles.colorRow}><input type="color" value={selectedPresentation.stroke} disabled={selectedPresentation.autoStroke} onChange={(event) => updateSelectedStyle({ stroke: event.target.value, autoStroke: false })}/><input className={styles.hexInput} key={`stroke-${selectedId}-${selectedPresentation.stroke}`} defaultValue={selectedPresentation.stroke} disabled={selectedPresentation.autoStroke} maxLength={7} onBlur={(event) => updateHexStyle("stroke", event.target.value, { autoStroke: false })}/></div></label>
        <label className={styles.field}>Grenzstärke <span className={styles.colorValue}>{selectedPresentation.strokeWidth.toFixed(1)} px</span><input type="range" min="0.5" max="8" step="0.25" value={selectedPresentation.strokeWidth} onChange={(event) => updateSelectedStyle({ strokeWidth: Number(event.target.value) })}/></label>
        {selectedPolitical && selectedChildren.length >= 2 ? <button type="button" className="button ghost" onClick={recolorSelectedChildren}>🎨 {selectedChildren.length} Untergebiete neu einfärben</button> : null}
      </div>

      <details className={styles.presentationDetails}>
        <summary>Weitere Label-Einstellungen</summary>
        <div className={styles.fieldStack}>
          <label className={styles.field}>Schriftstärke<select value={selectedPresentation.labelWeight} onChange={(event) => updateSelectedStyle({ labelWeight: Number(event.target.value) })}><option value="400">Normal</option><option value="500">Mittel</option><option value="600">Halbfett</option><option value="700">Fett</option><option value="800">Sehr fett</option></select></label>
          <label className={styles.field}>Halo / Outline<div className={styles.colorRow}><input type="color" value={selectedPresentation.labelHalo} onChange={(event) => updateSelectedStyle({ labelHalo: event.target.value })}/><span className={styles.colorValue}>{selectedPresentation.labelHalo}</span></div></label>
          <label className={styles.field}>Halo-Stärke <span className={styles.colorValue}>{selectedPresentation.labelHaloWidth.toFixed(1)} px</span><input type="range" min="0" max="8" step="0.5" value={selectedPresentation.labelHaloWidth} onChange={(event) => updateSelectedStyle({ labelHaloWidth: Number(event.target.value) })}/></label>
          <label className={styles.field}>Label-Deckkraft <span className={styles.colorValue}>{Math.round(selectedPresentation.labelOpacity * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={selectedPresentation.labelOpacity} onChange={(event) => updateSelectedStyle({ labelOpacity: Number(event.target.value) })}/></label>
          <div className={styles.twoFields}><label className={styles.field}>Position X<input type="number" min="-500" max="500" value={selectedPresentation.labelOffsetX} onChange={(event) => updateSelectedStyle({ labelOffsetX: Number(event.target.value) || 0 })}/></label><label className={styles.field}>Position Y<input type="number" min="-500" max="500" value={selectedPresentation.labelOffsetY} onChange={(event) => updateSelectedStyle({ labelOffsetY: Number(event.target.value) || 0 })}/></label></div>
          <button type="button" className="button ghost" onClick={() => updateSelectedStyle({ labelOffsetX: 0, labelOffsetY: selectedRow.geometry.type.includes("Point") ? -14 : 0 })}>Position zurücksetzen</button>
          <div className={styles.twoFields}><label className={styles.field}>Sichtbar ab Zoom<input type="number" min="0" max="30" step="0.25" value={selectedPresentation.labelMinZoom ?? 0} onChange={(event) => updateSelectedStyle({ labelMinZoom: Number(event.target.value) })}/></label><label className={styles.field}>Bis Zoom<input type="number" min="0" max="30" step="0.25" placeholder="ohne Limit" value={selectedPresentation.labelMaxZoom ?? ""} onChange={(event) => updateSelectedStyle({ labelMaxZoom: event.target.value === "" ? null : Number(event.target.value) })}/></label></div>
        </div>
      </details>

      <p className={styles.inspectorText}>{selectedLocked ? "Die Geometrie ist gegen Verschieben und Löschen gesperrt. Label und Darstellung dürfen weiterhin geändert werden." : selectedKind === "country" && landMaskLayer ? "Grenzpunkte bleiben weiterhin mit Landmaske und gemeinsamen Nachbargrenzen abgesichert." : selectedRow.location_parent_id ? "Die Fläche bleibt innerhalb ihrer Parent-Grenze. Darstellungsänderungen verändern die Geometrie nicht." : "Ziehe Formpunkte direkt auf der Karte. Darstellungsänderungen werden nach kurzer Pause automatisch gespeichert."}</p>
      <div className={styles.inspectorActions}>
        {selectedRow.entity_type === "location" && selectedRow.entity_id ? <a className="button primary" href={`/admin/projects/${projectId}/locations/${selectedRow.entity_id}`}>Location öffnen</a> : null}
        <button type="button" className="button ghost" onClick={() => changeSelectionScope(scopeForRow(selectedRow))}>Nur diesen Typ auswählen</button>
        <button type="button" className="button ghost" onClick={() => void toggleSelectedLock()}>{selectedLocked ? "🔓 Geometrie entsperren" : "🔒 Geometrie sperren"}</button>
        {canSplitSelected ? <button type="button" className="button ghost" disabled={selectedLocked} onClick={openProvinceDivider}>{selectedKind === "province" ? "✂ Provinz mit Trennlinie teilen" : "✂ Untergebiete erzeugen"}</button> : null}
        {canReconformSelected ? <button type="button" className="button ghost" disabled={selectedLocked} onClick={() => void reconformSelected()}>{selectedKind === "country" ? "Neu mit Landmaske verschneiden" : "An Parent-Grenze anpassen"}</button> : null}
        <button type="button" className={`button danger ${styles.dangerAction}`} disabled={deletingId === selectedId || selectedLocked} onClick={() => void deleteSelected()}>{deletingId === selectedId ? "Wird entfernt …" : selectedLocked ? "Geometrie gesperrt" : "Von Karte entfernen"}</button>
        <small className={styles.panelText}>{selectedLocked ? "Die Sperre schützt Form und Löschung, nicht die reine Kartendarstellung." : "Die Karten-Geometrie wird gelöscht. Der Lore-Datensatz bleibt bestehen."}</small>
      </div>
    </aside> : null}

    <div className={`${styles.statusDock} ${styles.glass}`}><span className={`${styles.statusDot}${saveState === "saved" ? ` ${styles.statusDotSaved}` : saveState === "saving" ? ` ${styles.statusDotSaving}` : ""}`}/><span className={styles.statusText}>{saveState === "saving" ? "Speichert …" : saveState === "saved" ? "Gespeichert" : drawing ? "Zeichenmodus aktiv" : status}</span></div>
    {status && saveState === "saved" ? <div className={styles.successToast} aria-live="polite">{status}</div> : null}
    {error ? <div className={styles.errorToast} aria-live="assertive">{error}</div> : null}
  </div>;
}
