"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { colorWithAlpha, ensureOpenLayers, mapColor, mediaMapUrl, parseMapBounds } from "./openlayers-runtime";
import type { MapSearchItem, WorldMapConfig, WorldMapFeature, WorldMapLayer, WorldMapMarker } from "./map-types";
import styles from "./map-workspace.module.css";

const MARKER_GLYPHS: Record<string, string> = {
  location: "⌂", person: "●", npc: "●", character: "●", god: "✦", group: "◆", event: "◷",
  landmark: "▲", dungeon: "▣", portal: "◎", quest: "!", party_location: "●", player_origin: "◇", custom: "•",
};

const PRESETS = [
  { id: "default", label: "Standard" },
  { id: "political", label: "Politisch" },
  { id: "climate", label: "Klima" },
  { id: "rainfall", label: "Niederschlag" },
  { id: "topography", label: "Topografie" },
] as const;

type Selection = { label: string; subtitle: string | null; href: string | null; featureId: number | null; markerId: number | null };

function localSearch(features: WorldMapFeature[], markers: WorldMapMarker[], query: string): MapSearchItem[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  const featureResults = features.filter((item) => item.label.toLocaleLowerCase().includes(term)).slice(0, 8).map((item) => ({
    kind: item.entity_type === "location" ? "location" as const : "feature" as const,
    id: Number(item.entity_id ?? item.feature_id), name: item.label, subtitle: item.short_description,
    featureId: Number(item.feature_id), markerId: null, href: null,
  }));
  const markerResults = markers.filter((item) => item.label.toLocaleLowerCase().includes(term) || item.entity_label?.toLocaleLowerCase().includes(term)).slice(0, 8).map((item) => ({
    kind: item.entity_type === "person" ? "person" as const : "marker" as const,
    id: Number(item.entity_id ?? item.marker_id), name: item.entity_label || item.label,
    subtitle: item.short_description ?? item.label, featureId: null, markerId: Number(item.marker_id), href: null,
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
  mapConfig, layers, features, markers = [], searchEndpoint = null, focusFeatureId = null, focusMarkerId = null,
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
  const defaultVisibility = useRef(new Map<number, boolean>());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [error, setError] = useState("");
  const [activePreset, setActivePreset] = useState("default");
  const [layersOpen, setLayersOpen] = useState(false);
  const rasterLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "raster"), [layers]);
  const vectorLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "vector"), [layers]);

  function focusFeature(id: number) {
    const feature = featureRefs.current.get(id), map = mapRef.current;
    if (!feature || !map) return false;
    const extent = feature.getGeometry()?.getExtent();
    if (!extent) return false;
    map.getView().fit(extent, { padding: [90, 90, 90, 90], maxZoom: Math.min(mapConfig.maxZoom, 5), duration: 280 });
    setSelection({ label: String(feature.get("label") ?? "Kartenobjekt"), subtitle: feature.get("subtitle") ? String(feature.get("subtitle")) : null, href: null, featureId: id, markerId: null });
    return true;
  }

  function focusMarker(id: number) {
    const feature = markerRefs.current.get(id), map = mapRef.current;
    if (!feature || !map) return false;
    const coordinates = feature.getGeometry()?.getCoordinates();
    if (!coordinates) return false;
    map.getView().animate({ center: coordinates, zoom: Math.min(mapConfig.maxZoom, Math.max(map.getView().getZoom() ?? 0, 3)), duration: 280 });
    setSelection({ label: String(feature.get("label") ?? "Marker"), subtitle: feature.get("subtitle") ? String(feature.get("subtitle")) : null, href: null, featureId: null, markerId: id });
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
    let active = true;
    ensureOpenLayers().then((ol) => {
      if (!active || !targetRef.current) return;
      layerRefs.current.clear(); featureRefs.current.clear(); markerRefs.current.clear(); defaultVisibility.current.clear();
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
        const baseFill = mapColor(layer.style?.fill, "#7c6ee6"), baseStroke = mapColor(layer.style?.stroke, "#f5f5f5"), baseWidth = Number(layer.style?.strokeWidth ?? 2);
        const rendered = new ol.layer.Vector({
          source, zIndex: layer.z_index || 500, visible: layer.visible_by_default, opacity: layer.opacity,
          style: (feature: any) => {
            const featureFill = mapColor(feature.get("fill"), baseFill), featureStroke = mapColor(feature.get("stroke"), baseStroke), geometryType = feature.getGeometry()?.getType();
            return new ol.style.Style({
              fill: geometryType?.includes("Polygon") ? new ol.style.Fill({ color: colorWithAlpha(featureFill, 0.28) }) : undefined,
              stroke: new ol.style.Stroke({ color: featureStroke, width: Number(feature.get("strokeWidth") ?? baseWidth) }),
              image: new ol.style.Circle({ radius: 6, fill: new ol.style.Fill({ color: featureFill }), stroke: new ol.style.Stroke({ color: featureStroke, width: 2 }) }),
              text: feature.get("label") ? new ol.style.Text({ text: String(feature.get("label")), offsetY: -12, fill: new ol.style.Fill({ color: "#fff" }), stroke: new ol.style.Stroke({ color: "#111", width: 3 }) }) : undefined,
            });
          },
        });
        rendered.set("worldrebornLayerId", id); layerRefs.current.set(id, rendered); renderedLayers.push(rendered);
        for (const row of features.filter((item) => Number(item.layer_id) === id)) {
          try {
            const featureId = Number(row.feature_id);
            const feature = geojson.readFeature({ type: "Feature", geometry: row.geometry, properties: { featureId, label: row.label, subtitle: row.short_description, entityType: row.entity_type, entityId: row.entity_id, fill: row.style?.fill, stroke: row.style?.stroke, strokeWidth: row.style?.strokeWidth } });
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
          feature.setProperties({ markerId, label: marker.entity_label || marker.label, subtitle: marker.short_description || marker.label, markerType: marker.marker_type, entityType: marker.entity_type, entityId: marker.entity_id });
          markerSource.addFeature(feature); markerRefs.current.set(markerId, feature);
        }
        renderedLayers.push(new ol.layer.Vector({
          source: markerSource, zIndex: 10000,
          style: (feature: any) => new ol.style.Style({ image: new ol.style.Circle({ radius: 10, fill: new ol.style.Fill({ color: "rgba(20,24,31,.9)" }), stroke: new ol.style.Stroke({ color: "#fff", width: 2 }) }), text: new ol.style.Text({ text: MARKER_GLYPHS[String(feature.get("markerType"))] ?? "•", fill: new ol.style.Fill({ color: "#fff" }), offsetY: 1 }) }),
        }));
      }

      const view = simple ? new ol.View({ projection, center: ol.extent.getCenter(extent), zoom: 0, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom, extent }) : new ol.View({ center: ol.proj.fromLonLat([mapConfig.centerLng ?? 0, mapConfig.centerLat ?? 0]), zoom: Math.max(mapConfig.minZoom, 2), minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom });
      const map = new ol.Map({ target: targetRef.current, layers: renderedLayers, view }); mapRef.current = map;
      if (simple) view.fit(extent, { padding: [24, 24, 24, 24] });
      map.on("singleclick", (event: any) => {
        const hit = map.forEachFeatureAtPixel(event.pixel, (feature: any) => feature);
        if (!hit) { setSelection(null); return; }
        const featureId = Number(hit.get("featureId")) || null, markerId = Number(hit.get("markerId")) || null;
        setSelection({ label: String(hit.get("label") ?? "Kartenobjekt"), subtitle: hit.get("subtitle") ? String(hit.get("subtitle")) : null, href: null, featureId, markerId });
      });
      if (focusFeatureId) focusFeature(focusFeatureId); else if (focusMarkerId) focusMarker(focusMarkerId);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Karte konnte nicht geladen werden."));
    return () => { active = false; mapRef.current?.setTarget(undefined); mapRef.current = null; layerRefs.current.clear(); featureRefs.current.clear(); markerRefs.current.clear(); };
  }, [mapConfig, rasterLayers, vectorLayers, features, markers, focusFeatureId, focusMarkerId]);

  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults([]); return; }
    const fallback = localSearch(features, markers, term);
    if (!searchEndpoint || term.length < 2) { setResults(fallback); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const separator = searchEndpoint.includes("?") ? "&" : "?";
        const response = await fetch(`${searchEndpoint}${separator}q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Kartensuche fehlgeschlagen.");
        setResults(Array.isArray(body.items) ? body.items : fallback);
      } catch (cause) { if ((cause as Error).name !== "AbortError") setResults(fallback); }
      finally { setSearching(false); }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, searchEndpoint, features, markers]);

  function chooseResult(item: MapSearchItem) {
    let focused = false;
    if (item.featureId) focused = focusFeature(item.featureId);
    if (!focused && item.markerId) focused = focusMarker(item.markerId);
    if (!focused && item.href) { window.location.assign(item.href); return; }
    if (focused) setSelection({ label: item.name, subtitle: item.subtitle, href: item.href, featureId: item.featureId, markerId: item.markerId });
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
          <input className={styles.searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Land, Stadt, NPC oder Ort suchen …" aria-label="In dieser Karte suchen"/>
          {searching ? <span className={styles.searchBusy}>Suche …</span> : null}
        </div>
        {query.trim() ? <div className={`${styles.searchResults} ${styles.glass}`}>
          {results.length ? results.map((item, index) => <button key={`${item.kind}-${item.id}-${index}`} type="button" className={styles.searchResult} onClick={() => chooseResult(item)}>
            <span className={styles.searchResultMain}><strong>{item.name}</strong>{item.subtitle ? <small>{item.subtitle}</small> : null}</span><span className={styles.resultKind}>{kindLabel(item.kind)}</span>
          </button>) : !searching ? <div className={styles.noResults}>Keine sichtbaren Treffer auf dieser Karte.</div> : null}
        </div> : null}
      </div>

      <div className={styles.actionDock}>
        <button type="button" className={`${styles.iconAction} ${styles.glass}${layersOpen ? ` ${styles.actionActive}` : ""}`} onClick={() => setLayersOpen((value) => !value)} aria-expanded={layersOpen}>☷ Ebenen</button>
      </div>

      {layersOpen ? <aside className={`${styles.layerDrawer} ${styles.glass}`}>
        <div className={styles.drawerHeader}><div><strong>Kartenebenen</strong><span>{layers.length} Ebenen auf dieser Karte</span></div><button type="button" className={styles.closeButton} onClick={() => setLayersOpen(false)} aria-label="Ebenen schließen">×</button></div>
        <div className={styles.layerList}>{groupedLayers.map(([group, rows]) => <div key={group}><div className={styles.layerSection}>{group}</div>{rows.map((layer) => {
          const id = Number(layer.layer_id); const satelliteIsBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath);
          return <div className={styles.layerRow} key={layer.layer_id}><div className={styles.layerInfo}><strong>{layer.name}</strong><small>{satelliteIsBase ? "Basiskarte" : layer.layer_type === "vector" ? "Eigene Inhalte" : "Rock-3-Daten"}</small></div><div className={styles.layerControl}><input data-world-map-layer={id} type="checkbox" defaultChecked={satelliteIsBase || layer.visible_by_default} disabled={satelliteIsBase} onChange={(event) => toggleLayer(id, event.target.checked)} aria-label={`${layer.name} ein- oder ausblenden`}/></div></div>;
        })}</div>)}</div>
      </aside> : null}

      <div className={`${styles.viewSwitcher} ${styles.glass}`}>{PRESETS.map((preset) => <button key={preset.id} type="button" className={`${styles.viewButton}${activePreset === preset.id ? ` ${styles.viewActive}` : ""}`} onClick={() => applyPreset(preset.id)}>{preset.label}</button>)}</div>

      {selection ? <aside className={`${styles.inspector} ${styles.glass}`}>
        <div className={styles.panelHeader}><div><span className={styles.kicker}>AUSGEWÄHLT</span><h3 className={styles.panelTitle}>{selection.label}</h3></div><button type="button" className={styles.closeButton} onClick={() => setSelection(null)} aria-label="Auswahl schließen">×</button></div>
        {selection.subtitle ? <p className={styles.inspectorText}>{selection.subtitle}</p> : null}
        <div className={styles.inspectorActions}>{selection.href ? <a className="button primary" href={selection.href}>Details öffnen</a> : null}</div>
      </aside> : null}
    </> : null}

    {error ? <div className={styles.errorToast} aria-live="assertive">{error}</div> : null}
  </div>;
}
