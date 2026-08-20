"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createMapFeatureStyle } from "./map-feature-presentation";
import { ensureOpenLayers, mediaMapUrl, parseMapBounds } from "./openlayers-runtime";
import {
  DEFAULT_MAP_CONTENT_VISIBILITY,
  MAP_CONTENT_FILTERS,
  allContentVisibility,
  featureContentCategory,
  type MapContentVisibility,
} from "./map-content-visibility";
import { rankSelectionCandidates, selectionCandidateFromRow } from "./map-selection";
import type { MapSearchItem, WorldMapConfig, WorldMapFeature, WorldMapLayer, WorldMapMarker } from "./map-types";
import styles from "./map-workspace.module.css";

const MARKER_GLYPHS: Record<string, string> = {
  location: "⌂", person: "●", npc: "●", character: "●", god: "✦", group: "◆", event: "◷",
  landmark: "▲", dungeon: "▣", portal: "◎", quest: "!", party_location: "●", player_origin: "◇", species: "◉", custom: "•",
};

const PRESETS = [
  { id: "default", label: "Standard" },
  { id: "political", label: "Politisch" },
  { id: "climate", label: "Klima" },
  { id: "rainfall", label: "Niederschlag" },
  { id: "topography", label: "Topografie" },
] as const;

const EMPTY_MARKERS: WorldMapMarker[] = [];

type Selection = { label: string; subtitle: string | null; href: string | null; image: string | null; featureId: number | null; markerId: number | null };

function sameSelection(current: Selection | null, next: Selection) {
  return Boolean(
    current
    && current.label === next.label
    && current.subtitle === next.subtitle
    && current.href === next.href
    && current.image === next.image
    && current.featureId === next.featureId
    && current.markerId === next.markerId
  );
}

function markerIsVisible(markerType: string | null | undefined, visibility: MapContentVisibility) {
  return markerType === "species" ? visibility.species : visibility.markers;
}

function localSearch(features: WorldMapFeature[], markers: WorldMapMarker[], query: string, visibility: MapContentVisibility): MapSearchItem[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  const featureResults = features
    .filter((item) => visibility[featureContentCategory(item)] && item.label.toLocaleLowerCase().includes(term))
    .slice(0, 8)
    .map((item) => ({
      kind: item.entity_type === "location" ? "location" as const : "feature" as const,
      id: Number(item.entity_id ?? item.feature_id), name: item.label, subtitle: item.short_description,
      featureId: Number(item.feature_id), markerId: null, href: null,
    }));
  const markerResults = markers
    .filter((item) => markerIsVisible(item.marker_type, visibility))
    .filter((item) => item.label.toLocaleLowerCase().includes(term) || item.entity_label?.toLocaleLowerCase().includes(term))
    .slice(0, 8)
    .map((item) => ({
      kind: item.entity_type === "person" ? "person" as const : "marker" as const,
      id: Number(item.entity_id ?? item.marker_id), name: item.entity_label || item.label,
      subtitle: item.short_description ?? item.entity_kind ?? item.label, featureId: null, markerId: Number(item.marker_id), href: item.href ?? null,
    }));
  return [...featureResults, ...markerResults].slice(0, 12);
}

function kindLabel(kind: MapSearchItem["kind"]) {
  if (kind === "location") return "Ort";
  if (kind === "person") return "Person";
  if (kind === "marker") return "Marker";
  return "Objekt";
}

function layerGroup(layer: WorldMapLayer) {
  if (layer.layer_type === "vector") return "Eigene Inhalte";
  const role = layer.layer_role ?? "";
  if (role === "satellite") return "Basiskarte";
  if (role === "biomes" || role.startsWith("rainfall") || role.startsWith("temperature")) return "Klima";
  if (role.startsWith("elevation") || role === "land_mask") return "Terrain";
  return "Weltdaten";
}

export function WorldMapViewer({
  mapConfig, layers, features, markers = EMPTY_MARKERS, searchEndpoint = null, focusFeatureId = null, focusMarkerId = null,
  height = "calc(100vh - 110px)", showSearch = true,
}: {
  mapConfig: WorldMapConfig; layers: WorldMapLayer[]; features: WorldMapFeature[]; markers?: WorldMapMarker[];
  searchEndpoint?: string | null; focusFeatureId?: number | null; focusMarkerId?: number | null; height?: string; showSearch?: boolean;
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRefs = useRef(new Map<number, any>());
  const featureRefs = useRef(new Map<number, any>());
  const markerRefs = useRef(new Map<number, any>());
  const markerLayerRef = useRef<any>(null);
  const defaultVisibility = useRef(new Map<number, boolean>());
  const contentVisibilityRef = useRef<MapContentVisibility>({ ...DEFAULT_MAP_CONTENT_VISIBILITY });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState("");
  const [activePreset, setActivePreset] = useState("default");
  const [layersOpen, setLayersOpen] = useState(false);
  const [contentVisibility, setContentVisibility] = useState<MapContentVisibility>({ ...DEFAULT_MAP_CONTENT_VISIBILITY });
  const rasterLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "raster"), [layers]);
  const vectorLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "vector"), [layers]);
  const featureRows = useMemo(() => new Map(features.map((row) => [Number(row.feature_id), row] as const)), [features]);
  const speciesMarkerCount = useMemo(() => markers.filter((marker) => marker.marker_type === "species").length, [markers]);
  const regularMarkerCount = markers.length - speciesMarkerCount;

  function refreshContentVisibility(next: MapContentVisibility) {
    contentVisibilityRef.current = next;
    setContentVisibility(next);
    for (const layer of vectorLayers) layerRefs.current.get(Number(layer.layer_id))?.changed();
    markerLayerRef.current?.setVisible(next.markers || next.species);
    markerLayerRef.current?.changed();
    if (selection?.featureId) {
      const row = featureRows.get(selection.featureId);
      if (row && !next[featureContentCategory(row)]) setSelection(null);
    }
    if (selection?.markerId) {
      const marker = markerRefs.current.get(selection.markerId);
      if (marker && !markerIsVisible(String(marker.get("markerType") ?? ""), next)) setSelection(null);
    }
    setActivePreset("custom");
  }

  function toggleContent(key: keyof MapContentVisibility, visible: boolean) {
    refreshContentVisibility({ ...contentVisibilityRef.current, [key]: visible });
  }

  function focusFeature(id: number) {
    const row = featureRows.get(id);
    if (row && !contentVisibilityRef.current[featureContentCategory(row)]) return false;
    const feature = featureRefs.current.get(id), map = mapRef.current;
    if (!feature || !map) return false;
    const extent = feature.getGeometry()?.getExtent();
    if (!extent) return false;
    map.getView().fit(extent, { padding: [90, 90, 90, 90], maxZoom: Math.min(mapConfig.maxZoom, 5), duration: 280 });
    const nextSelection: Selection = { label: String(feature.get("label") ?? "Kartenobjekt"), subtitle: feature.get("subtitle") ? String(feature.get("subtitle")) : null, href: null, image: null, featureId: id, markerId: null };
    setSelection((current) => sameSelection(current, nextSelection) ? current : nextSelection);
    return true;
  }

  function focusMarker(id: number) {
    const feature = markerRefs.current.get(id), map = mapRef.current;
    if (!feature || !map || !markerIsVisible(String(feature.get("markerType") ?? ""), contentVisibilityRef.current)) return false;
    const coordinates = feature.getGeometry()?.getCoordinates();
    if (!coordinates) return false;
    map.getView().animate({ center: coordinates, zoom: Math.min(mapConfig.maxZoom, Math.max(map.getView().getZoom() ?? 0, 3)), duration: 280 });
    const nextSelection: Selection = {
      label: String(feature.get("label") ?? "Marker"),
      subtitle: feature.get("subtitle") ? String(feature.get("subtitle")) : null,
      href: feature.get("href") ? String(feature.get("href")) : null,
      image: feature.get("previewImage") ? String(feature.get("previewImage")) : null,
      featureId: null,
      markerId: id,
    };
    setSelection((current) => sameSelection(current, nextSelection) ? current : nextSelection);
    return true;
  }

  function applyPreset(preset: string) {
    setActivePreset(preset);
    for (const layer of layers) {
      const id = Number(layer.layer_id), olLayer = layerRefs.current.get(id);
      if (!olLayer) continue;
      let visible = defaultVisibility.current.get(id) ?? layer.visible_by_default;
      if (preset === "political") visible = layer.layer_type === "vector" && ["political", "settlements"].includes(layer.layer_role ?? "");
      if (preset === "climate") visible = layer.layer_role === "biomes" || (layer.layer_type === "vector" && layer.layer_role === "political");
      if (preset === "rainfall") visible = layer.layer_role === "rainfall_annual" || (layer.layer_type === "vector" && layer.layer_role === "political");
      if (preset === "topography") visible = ["elevation_full", "elevation_land", "land_mask"].includes(layer.layer_role ?? "") || (layer.layer_type === "vector" && layer.layer_role === "political");
      olLayer.setVisible(visible);
      const checkbox = document.querySelector<HTMLInputElement>(`[data-world-map-layer="${id}"]`);
      if (checkbox) checkbox.checked = visible;
    }
  }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`worldreborn:map-content:${mapConfig.mapId}`);
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<MapContentVisibility>;
      const next = { ...DEFAULT_MAP_CONTENT_VISIBILITY, ...parsed };
      contentVisibilityRef.current = next;
      setContentVisibility(next);
    } catch { /* local preference is optional */ }
  }, [mapConfig.mapId]);

  useEffect(() => {
    try { window.localStorage.setItem(`worldreborn:map-content:${mapConfig.mapId}`, JSON.stringify(contentVisibility)); } catch { /* local preference is optional */ }
  }, [contentVisibility, mapConfig.mapId]);

  useEffect(() => {
    let active = true;
    ensureOpenLayers().then((ol) => {
      if (!active || !targetRef.current) return;
      layerRefs.current.clear(); featureRefs.current.clear(); markerRefs.current.clear(); defaultVisibility.current.clear(); markerLayerRef.current = null;
      const simple = mapConfig.mapType === "image";
      const bounds = parseMapBounds(mapConfig.bounds) ?? [[0, 0], [4096, 8192]];
      const extent = [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]];
      const projection = simple ? new ol.proj.Projection({ code: `WORLDREBORN:VIEW:${mapConfig.mapId}`, units: "pixels", extent }) : undefined;
      const renderedLayers: any[] = [];

      if (simple && mapConfig.imagePath) {
        const url = mediaMapUrl(mapConfig.imagePath);
        if (url) renderedLayers.push(new ol.layer.Image({ zIndex: -1000, source: new ol.source.ImageStatic({ url, projection, imageExtent: extent }) }));
      } else if (mapConfig.tileUrl) {
        renderedLayers.push(new ol.layer.Tile({ zIndex: -1000, source: new ol.source.XYZ({ url: mapConfig.tileUrl, wrapX: false, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom }) }));
      }

      for (const layer of rasterLayers) {
        const id = Number(layer.layer_id);
        const satelliteIsBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath);
        defaultVisibility.current.set(id, satelliteIsBase || layer.visible_by_default);
        if (satelliteIsBase) continue;
        const url = layer.source_type === "media" && layer.media_id ? `/api/media/${layer.media_id}` : layer.source_url;
        if (!url) continue;
        let rendered: any = null;
        if (simple && (layer.source_type === "media" || layer.source_type === "image")) rendered = new ol.layer.Image({ opacity: layer.opacity, visible: layer.visible_by_default, zIndex: layer.z_index, source: new ol.source.ImageStatic({ url, projection, imageExtent: extent }) });
        else if (layer.source_type === "tile") rendered = new ol.layer.Tile({ opacity: layer.opacity, visible: layer.visible_by_default, zIndex: layer.z_index, source: new ol.source.XYZ({ url, wrapX: false }) });
        if (rendered) { rendered.set("worldrebornLayerId", id); layerRefs.current.set(id, rendered); renderedLayers.push(rendered); }
      }

      const geojson = new ol.format.GeoJSON();
      for (const layer of vectorLayers) {
        const id = Number(layer.layer_id); defaultVisibility.current.set(id, layer.visible_by_default);
        const source = new ol.source.Vector();
        const rendered = new ol.layer.Vector({
          source,
          zIndex: layer.z_index || 500,
          visible: layer.visible_by_default,
          opacity: layer.opacity,
          declutter: true,
          style: (feature: any) => {
            const featureId = Number(feature.get("featureId"));
            const row = featureRows.get(featureId);
            if (!row || !contentVisibilityRef.current[featureContentCategory(row)]) return null;
            return createMapFeatureStyle(ol, {
              row,
              layerStyle: layer.style,
              labelsEnabled: contentVisibilityRef.current.labels,
              zoom: mapRef.current?.getView().getZoom() ?? null,
              declutterLabels: true,
              pointRadius: 6,
            });
          },
        });
        rendered.set("worldrebornLayerId", id); layerRefs.current.set(id, rendered); renderedLayers.push(rendered);
        for (const row of features.filter((item) => Number(item.layer_id) === id)) {
          try {
            const featureId = Number(row.feature_id);
            const feature = geojson.readFeature({ type: "Feature", geometry: row.geometry, properties: { featureId, label: row.label, subtitle: row.short_description, entityType: row.entity_type, entityId: row.entity_id, contentCategory: featureContentCategory(row) } });
            source.addFeature(feature); featureRefs.current.set(featureId, feature);
          } catch { /* malformed legacy geometry stays isolated */ }
        }
      }

      if (markers.length) {
        const markerSource = new ol.source.Vector();
        for (const marker of markers) {
          let coordinates: [number, number] | null = null;
          if (simple && marker.coordinate_mode === "xy" && marker.x != null && marker.y != null) coordinates = [marker.x, marker.y];
          if (!simple && marker.lat != null && marker.lng != null) coordinates = ol.proj.fromLonLat([marker.lng, marker.lat]);
          if (!coordinates) continue;
          const markerId = Number(marker.marker_id), feature = new ol.Feature({ geometry: new ol.geom.Point(coordinates) });
          feature.setProperties({
            markerId,
            label: marker.entity_label || marker.label,
            subtitle: marker.short_description || marker.entity_kind || marker.label,
            markerType: marker.marker_type,
            entityType: marker.entity_type,
            entityId: marker.entity_id,
            previewImage: marker.icon || null,
            href: marker.href || null,
          });
          markerSource.addFeature(feature); markerRefs.current.set(markerId, feature);
        }
        const markerLayer = new ol.layer.Vector({
          source: markerSource,
          zIndex: 10000,
          visible: contentVisibilityRef.current.markers || contentVisibilityRef.current.species,
          declutter: true,
          style: (feature: any) => {
            const markerType = String(feature.get("markerType") ?? "custom");
            if (!markerIsVisible(markerType, contentVisibilityRef.current)) return null;
            if (markerType === "species") {
              const label = contentVisibilityRef.current.labels ? String(feature.get("label") ?? "") : "";
              const image = feature.get("previewImage") ? String(feature.get("previewImage")) : null;
              const labelStyle = new ol.style.Text({
                text: label,
                offsetY: image ? 36 : 29,
                font: "600 11px system-ui, sans-serif",
                fill: new ol.style.Fill({ color: "#fff8e6" }),
                stroke: new ol.style.Stroke({ color: "rgba(8,11,15,.96)", width: 4 }),
                backgroundFill: new ol.style.Fill({ color: "rgba(12,16,22,.82)" }),
                padding: [3, 5, 3, 5],
              });
              if (image) {
                return [
                  new ol.style.Style({ image: new ol.style.Circle({ radius: 26, fill: new ol.style.Fill({ color: "rgba(14,18,24,.96)" }), stroke: new ol.style.Stroke({ color: "#d4b76e", width: 3 }) }) }),
                  new ol.style.Style({ image: new ol.style.Icon({ src: image, width: 42, height: 42 }), text: labelStyle }),
                ];
              }
              return new ol.style.Style({
                image: new ol.style.Circle({ radius: 15, fill: new ol.style.Fill({ color: "rgba(37,31,19,.96)" }), stroke: new ol.style.Stroke({ color: "#d4b76e", width: 3 }) }),
                text: new ol.style.Text({ text: MARKER_GLYPHS.species, fill: new ol.style.Fill({ color: "#f4d58d" }), stroke: new ol.style.Stroke({ color: "#17130b", width: 2 }), offsetY: 1 }),
              });
            }
            return new ol.style.Style({ image: new ol.style.Circle({ radius: 10, fill: new ol.style.Fill({ color: "rgba(20,24,31,.9)" }), stroke: new ol.style.Stroke({ color: "#fff", width: 2 }) }), text: new ol.style.Text({ text: MARKER_GLYPHS[markerType] ?? "•", fill: new ol.style.Fill({ color: "#fff" }), offsetY: 1 }) });
          },
        });
        markerLayerRef.current = markerLayer;
        renderedLayers.push(markerLayer);
      }

      const view = simple ? new ol.View({ projection, center: ol.extent.getCenter(extent), zoom: 0, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom, extent }) : new ol.View({ center: ol.proj.fromLonLat([mapConfig.centerLng ?? 0, mapConfig.centerLat ?? 0]), zoom: Math.max(mapConfig.minZoom, 2), minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom });
      const map = new ol.Map({ target: targetRef.current, layers: renderedLayers, view }); mapRef.current = map;
      if (simple) view.fit(extent, { padding: [24, 24, 24, 24] });

      const collectVisibleHits = (pixel: number[]) => {
        const seen = new Set<number>();
        const mapCandidates: ReturnType<typeof selectionCandidateFromRow>[] = [];
        let markerHit: any = null;
        map.forEachFeatureAtPixel(pixel, (feature: any) => {
          const markerId = Number(feature.get("markerId"));
          if (markerId) {
            const markerType = String(feature.get("markerType") ?? "custom");
            if (markerIsVisible(markerType, contentVisibilityRef.current) && !markerHit) markerHit = feature;
            return undefined;
          }
          const featureId = Number(feature.get("featureId"));
          if (!featureId || seen.has(featureId)) return undefined;
          const row = featureRows.get(featureId);
          if (!row || !contentVisibilityRef.current[featureContentCategory(row)]) return undefined;
          seen.add(featureId);
          const featureExtent = feature.getGeometry()?.getExtent();
          const extentArea = featureExtent ? Math.max(0, (featureExtent[2] - featureExtent[0]) * (featureExtent[3] - featureExtent[1])) : 0;
          mapCandidates.push(selectionCandidateFromRow(featureId, row, extentArea));
          return undefined;
        }, { hitTolerance: 10 });
        return { markerHit, mapCandidates: rankSelectionCandidates(mapCandidates) };
      };

      map.on("singleclick", (event: any) => {
        const { markerHit, mapCandidates } = collectVisibleHits(event.pixel);
        if (markerHit) {
          const markerId = Number(markerHit.get("markerId")) || null;
          setSelection({
            label: String(markerHit.get("label") ?? "Marker"),
            subtitle: markerHit.get("subtitle") ? String(markerHit.get("subtitle")) : null,
            href: markerHit.get("href") ? String(markerHit.get("href")) : null,
            image: markerHit.get("previewImage") ? String(markerHit.get("previewImage")) : null,
            featureId: null,
            markerId,
          });
          return;
        }
        const candidate = mapCandidates[0];
        if (!candidate) { setSelection(null); return; }
        const feature = featureRefs.current.get(candidate.featureId);
        if (!feature) { setSelection(null); return; }
        setSelection({
          label: String(feature.get("label") ?? candidate.label ?? "Kartenobjekt"),
          subtitle: feature.get("subtitle") ? String(feature.get("subtitle")) : null,
          href: null,
          image: null,
          featureId: candidate.featureId,
          markerId: null,
        });
      });
      map.on("pointermove", (event: any) => {
        if (event.dragging) return;
        const { markerHit, mapCandidates } = collectVisibleHits(event.pixel);
        const element = map.getTargetElement();
        if (element) element.style.cursor = markerHit || mapCandidates.length ? "pointer" : "";
      });

      if (focusFeatureId) focusFeature(focusFeatureId); else if (focusMarkerId) focusMarker(focusMarkerId);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Karte konnte nicht geladen werden."));
    return () => { active = false; mapRef.current?.setTarget(undefined); mapRef.current = null; markerLayerRef.current = null; layerRefs.current.clear(); featureRefs.current.clear(); markerRefs.current.clear(); };
  }, [mapConfig, rasterLayers, vectorLayers, features, featureRows, markers, focusFeatureId, focusMarkerId]);

  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults([]); return; }
    const fallback = localSearch(features, markers, term, contentVisibilityRef.current);
    if (!searchEndpoint || term.length < 2) { setResults(fallback); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const separator = searchEndpoint.includes("?") ? "&" : "?";
        const response = await fetch(`${searchEndpoint}${separator}q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Kartensuche fehlgeschlagen.");
        const remote = Array.isArray(body.items) ? body.items as MapSearchItem[] : [];
        const seen = new Set<string>();
        const merged = [...fallback, ...remote].filter((item) => {
          const key = `${item.kind}:${item.id}:${item.featureId ?? ""}:${item.markerId ?? ""}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setResults(merged.slice(0, 12));
      } catch (cause) { if ((cause as Error).name !== "AbortError") setResults(fallback); }
      finally { setSearching(false); }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, searchEndpoint, features, markers, contentVisibility]);

  function chooseResult(item: MapSearchItem) {
    let focused = false;
    if (item.featureId) focused = focusFeature(item.featureId);
    if (!focused && item.markerId) focused = focusMarker(item.markerId);
    if (!focused && item.href) { window.location.assign(item.href); return; }
    if (focused) {
      const marker = item.markerId ? markerRefs.current.get(item.markerId) : null;
      setSelection({
        label: item.name,
        subtitle: item.subtitle,
        href: item.href,
        image: marker?.get("previewImage") ? String(marker.get("previewImage")) : null,
        featureId: item.featureId,
        markerId: item.markerId,
      });
    }
    setQuery(item.name); setResults([]);
  }

  function toggleLayer(id: number, visible: boolean) { layerRefs.current.get(id)?.setVisible(visible); setActivePreset("custom"); }
  const groupedLayers = useMemo(() => {
    const groups = new Map<string, WorldMapLayer[]>();
    for (const layer of layers) { const group = layerGroup(layer); groups.set(group, [...(groups.get(group) ?? []), layer]); }
    return [...groups.entries()];
  }, [layers]);

  return <div className={`${styles.workspace}${showSearch ? "" : ` ${styles.compact}`}`} style={{ height }}>
    <div ref={targetRef} className={styles.canvas}/>

    {showSearch ? <>
      <div className={styles.topSearch}>
        <div className={`${styles.searchShell} ${styles.glass}`}>
          <span className={styles.searchIcon} aria-hidden="true">⌕</span>
          <input className={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Land, Stadt, NPC, Spezies oder Ort suchen …" aria-label="In dieser Karte suchen"/>
          {searching ? <span className={styles.searchBusy}>Suche …</span> : null}
        </div>
        {query.trim() ? <div className={`${styles.searchResults} ${styles.glass}`}>
          {results.length ? results.map((item, index) => <button key={`${item.kind}-${item.id}-${index}`} type="button" className={styles.searchResult} onClick={() => chooseResult(item)}>
            <span className={styles.searchResultMain}><strong>{item.name}</strong>{item.subtitle ? <small>{item.subtitle}</small> : null}</span><span className={styles.resultKind}>{kindLabel(item.kind)}</span>
          </button>) : !searching ? <div className={styles.noResults}>Keine sichtbaren Treffer auf dieser Karte.</div> : null}
        </div> : null}
      </div>

      <div className={styles.actionDock}>
        <button type="button" className={`${styles.iconAction} ${styles.glass}${layersOpen ? ` ${styles.actionActive}` : ""}`} onClick={() => setLayersOpen((value) => !value)} aria-expanded={layersOpen}>☷ Sichtbarkeit</button>
      </div>

      {layersOpen ? <aside className={`${styles.layerDrawer} ${styles.glass}`}>
        <div className={styles.drawerHeader}><div><strong>Sichtbarkeit</strong><span>Inhalte und Kartenebenen getrennt steuern</span></div><button type="button" className={styles.closeButton} onClick={() => setLayersOpen(false)} aria-label="Sichtbarkeit schließen">×</button></div>
        <div className={styles.layerList}>
          <div>
            <div className={styles.layerSection}>Karteninhalte</div>
            <div className="row" style={{ gap: 6, padding: "4px 8px 7px" }}>
              <button type="button" className="button ghost" style={{ minHeight: 28, height: 28, padding: "0 8px", fontSize: 9 }} onClick={() => refreshContentVisibility(allContentVisibility(true))}>Alle an</button>
              <button type="button" className="button ghost" style={{ minHeight: 28, height: 28, padding: "0 8px", fontSize: 9 }} onClick={() => refreshContentVisibility(allContentVisibility(false))}>Alle aus</button>
            </div>
            {MAP_CONTENT_FILTERS.map((filter) => {
              const disabled = filter.id === "markers" ? regularMarkerCount === 0 : filter.id === "species" ? speciesMarkerCount === 0 : false;
              return <div className={styles.layerRow} key={filter.id}>
                <div className={styles.layerInfo}><strong>{filter.icon} {filter.label}</strong><small>{filter.hint}</small></div>
                <div className={styles.layerControl}><input type="checkbox" checked={contentVisibility[filter.id]} disabled={disabled} onChange={(event) => toggleContent(filter.id, event.target.checked)} aria-label={`${filter.label} ein- oder ausblenden`}/></div>
              </div>;
            })}
          </div>
          {groupedLayers.map(([group, rows]) => <div key={group}><div className={styles.layerSection}>{group}</div>{rows.map((layer) => {
            const id = Number(layer.layer_id); const satelliteIsBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath);
            return <div className={styles.layerRow} key={layer.layer_id}><div className={styles.layerInfo}><strong>{layer.name}</strong><small>{satelliteIsBase ? "Basiskarte" : layer.layer_type === "vector" ? "Eigene Inhalte" : "Rock-3-Daten"}</small></div><div className={styles.layerControl}><input data-world-map-layer={id} type="checkbox" defaultChecked={satelliteIsBase || layer.visible_by_default} disabled={satelliteIsBase} onChange={(event) => toggleLayer(id, event.target.checked)} aria-label={`${layer.name} ein- oder ausblenden`}/></div></div>;
          })}</div>)}
        </div>
      </aside> : null}

      <div className={`${styles.viewSwitcher} ${styles.glass}`}>{PRESETS.map((preset) => <button key={preset.id} type="button" className={`${styles.viewButton}${activePreset === preset.id ? ` ${styles.viewActive}` : ""}`} onClick={() => applyPreset(preset.id)}>{preset.label}</button>)}</div>

      {selection ? <aside className={`${styles.inspector} ${styles.glass}`}>
        <div className={styles.panelHeader}><div><span className={styles.kicker}>AUSGEWÄHLT</span><h3 className={styles.panelTitle}>{selection.label}</h3></div><button type="button" className={styles.closeButton} onClick={() => setSelection(null)} aria-label="Auswahl schließen">×</button></div>
        {selection.image ? <img className={styles.inspectorPreview} src={selection.image} alt=""/> : null}
        {selection.subtitle ? <p className={styles.inspectorText}>{selection.subtitle}</p> : null}
        <div className={styles.inspectorActions}>{selection.href ? <a className="button primary" href={selection.href}>Details öffnen</a> : null}</div>
      </aside> : null}
    </> : null}

    {error ? <div className={styles.errorToast} aria-live="assertive">{error}</div> : null}
  </div>;
}
