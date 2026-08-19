"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { colorWithAlpha, ensureOpenLayers, mapColor, mediaMapUrl, parseMapBounds } from "./openlayers-runtime";
import type { MapSearchItem, WorldMapConfig, WorldMapFeature, WorldMapLayer, WorldMapMarker } from "./map-types";

const MARKER_GLYPHS: Record<string, string> = {
  location: "⌂",
  person: "●",
  npc: "●",
  character: "●",
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

const PRESETS = [
  { id: "default", label: "Standard" },
  { id: "political", label: "Politische Karte" },
  { id: "climate", label: "Klima" },
  { id: "rainfall", label: "Niederschlag" },
  { id: "topography", label: "Topografie" },
] as const;

type Selection = {
  label: string;
  subtitle: string | null;
  href: string | null;
  featureId: number | null;
  markerId: number | null;
};

function localSearch(features: WorldMapFeature[], markers: WorldMapMarker[], query: string): MapSearchItem[] {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return [];
  const featureResults = features
    .filter((item) => item.label.toLocaleLowerCase().includes(term))
    .slice(0, 8)
    .map((item) => ({
      kind: item.entity_type === "location" ? "location" as const : "feature" as const,
      id: Number(item.entity_id ?? item.feature_id),
      name: item.label,
      subtitle: item.short_description,
      featureId: Number(item.feature_id),
      markerId: null,
      href: null,
    }));
  const markerResults = markers
    .filter((item) => item.label.toLocaleLowerCase().includes(term) || item.entity_label?.toLocaleLowerCase().includes(term))
    .slice(0, 8)
    .map((item) => ({
      kind: item.entity_type === "person" ? "person" as const : "marker" as const,
      id: Number(item.entity_id ?? item.marker_id),
      name: item.entity_label || item.label,
      subtitle: item.short_description ?? item.label,
      featureId: null,
      markerId: Number(item.marker_id),
      href: null,
    }));
  return [...featureResults, ...markerResults].slice(0, 12);
}

function kindLabel(kind: MapSearchItem["kind"]) {
  if (kind === "location") return "Ort";
  if (kind === "person") return "Person";
  if (kind === "marker") return "Marker";
  return "Kartenobjekt";
}

export function WorldMapViewer({
  mapConfig,
  layers,
  features,
  markers = [],
  searchEndpoint = null,
  focusFeatureId = null,
  focusMarkerId = null,
  height = "68vh",
  showSearch = true,
}: {
  mapConfig: WorldMapConfig;
  layers: WorldMapLayer[];
  features: WorldMapFeature[];
  markers?: WorldMapMarker[];
  searchEndpoint?: string | null;
  focusFeatureId?: number | null;
  focusMarkerId?: number | null;
  height?: string;
  showSearch?: boolean;
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
  const rasterLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "raster"), [layers]);
  const vectorLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "vector"), [layers]);

  function focusFeature(id: number) {
    const feature = featureRefs.current.get(id);
    const map = mapRef.current;
    if (!feature || !map) return false;
    const extent = feature.getGeometry()?.getExtent();
    if (!extent) return false;
    map.getView().fit(extent, { padding: [80, 80, 80, 80], maxZoom: Math.min(mapConfig.maxZoom, 5), duration: 280 });
    setSelection({
      label: String(feature.get("label") ?? "Kartenobjekt"),
      subtitle: feature.get("subtitle") ? String(feature.get("subtitle")) : null,
      href: feature.get("href") ? String(feature.get("href")) : null,
      featureId: id,
      markerId: null,
    });
    return true;
  }

  function focusMarker(id: number) {
    const feature = markerRefs.current.get(id);
    const map = mapRef.current;
    if (!feature || !map) return false;
    const coordinates = feature.getGeometry()?.getCoordinates();
    if (!coordinates) return false;
    map.getView().animate({ center: coordinates, zoom: Math.min(mapConfig.maxZoom, Math.max(map.getView().getZoom() ?? 0, 3)), duration: 280 });
    setSelection({
      label: String(feature.get("label") ?? "Marker"),
      subtitle: feature.get("subtitle") ? String(feature.get("subtitle")) : null,
      href: feature.get("href") ? String(feature.get("href")) : null,
      featureId: null,
      markerId: id,
    });
    return true;
  }

  function applyPreset(preset: string) {
    setActivePreset(preset);
    for (const layer of layers) {
      const id = Number(layer.layer_id);
      const olLayer = layerRefs.current.get(id);
      if (!olLayer) continue;
      let visible = defaultVisibility.current.get(id) ?? layer.visible_by_default;
      if (preset === "political") visible = layer.layer_type === "vector" && layer.layer_role === "political";
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
      layerRefs.current.clear();
      featureRefs.current.clear();
      markerRefs.current.clear();
      defaultVisibility.current.clear();

      const simple = mapConfig.mapType === "image";
      const bounds = parseMapBounds(mapConfig.bounds) ?? [[0, 0], [4096, 8192]];
      const extent = [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]];
      const projection = simple ? new ol.proj.Projection({ code: `WORLDREBORN:VIEW:${mapConfig.mapId}`, units: "pixels", extent }) : undefined;
      const renderedLayers: any[] = [];

      if (simple && mapConfig.imagePath) {
        const url = mediaMapUrl(mapConfig.imagePath);
        if (url) renderedLayers.push(new ol.layer.Image({ zIndex: -1000, source: new ol.source.ImageStatic({ url, projection, imageExtent: extent }) }));
      } else if (mapConfig.tileUrl) {
        renderedLayers.push(new ol.layer.Tile({
          zIndex: -1000,
          source: new ol.source.XYZ({ url: mapConfig.tileUrl, wrapX: false, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom }),
        }));
      }

      for (const layer of rasterLayers) {
        const id = Number(layer.layer_id);
        const satelliteIsBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath);
        defaultVisibility.current.set(id, satelliteIsBase || layer.visible_by_default);
        if (satelliteIsBase) continue;
        const url = layer.source_type === "media" && layer.media_id ? `/api/media/${layer.media_id}` : layer.source_url;
        if (!url) continue;
        let rendered: any = null;
        if (simple && (layer.source_type === "media" || layer.source_type === "image")) {
          rendered = new ol.layer.Image({
            opacity: layer.opacity,
            visible: layer.visible_by_default,
            zIndex: layer.z_index,
            source: new ol.source.ImageStatic({ url, projection, imageExtent: extent }),
          });
        } else if (layer.source_type === "tile") {
          rendered = new ol.layer.Tile({
            opacity: layer.opacity,
            visible: layer.visible_by_default,
            zIndex: layer.z_index,
            source: new ol.source.XYZ({ url, wrapX: false }),
          });
        }
        if (rendered) {
          rendered.set("worldrebornLayerId", id);
          layerRefs.current.set(id, rendered);
          renderedLayers.push(rendered);
        }
      }

      const geojson = new ol.format.GeoJSON();
      for (const layer of vectorLayers) {
        const id = Number(layer.layer_id);
        defaultVisibility.current.set(id, layer.visible_by_default);
        const source = new ol.source.Vector();
        const baseFill = mapColor(layer.style?.fill, "#7c6ee6");
        const baseStroke = mapColor(layer.style?.stroke, "#f5f5f5");
        const baseWidth = Number(layer.style?.strokeWidth ?? 2);
        const rendered = new ol.layer.Vector({
          source,
          zIndex: layer.z_index || 500,
          visible: layer.visible_by_default,
          opacity: layer.opacity,
          style: (feature: any) => {
            const featureFill = mapColor(feature.get("fill"), baseFill);
            const featureStroke = mapColor(feature.get("stroke"), baseStroke);
            const geometryType = feature.getGeometry()?.getType();
            return new ol.style.Style({
              fill: geometryType?.includes("Polygon") ? new ol.style.Fill({ color: colorWithAlpha(featureFill, 0.28) }) : undefined,
              stroke: new ol.style.Stroke({ color: featureStroke, width: Number(feature.get("strokeWidth") ?? baseWidth) }),
              image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: featureFill }),
                stroke: new ol.style.Stroke({ color: featureStroke, width: 2 }),
              }),
              text: feature.get("label") ? new ol.style.Text({
                text: String(feature.get("label")),
                offsetY: -12,
                fill: new ol.style.Fill({ color: "#fff" }),
                stroke: new ol.style.Stroke({ color: "#111", width: 3 }),
              }) : undefined,
            });
          },
        });
        rendered.set("worldrebornLayerId", id);
        layerRefs.current.set(id, rendered);
        renderedLayers.push(rendered);

        for (const row of features.filter((item) => Number(item.layer_id) === id)) {
          try {
            const featureId = Number(row.feature_id);
            const feature = geojson.readFeature({
              type: "Feature",
              geometry: row.geometry,
              properties: {
                featureId,
                label: row.label,
                subtitle: row.short_description,
                entityType: row.entity_type,
                entityId: row.entity_id,
                fill: row.style?.fill,
                stroke: row.style?.stroke,
                strokeWidth: row.style?.strokeWidth,
              },
            });
            source.addFeature(feature);
            featureRefs.current.set(featureId, feature);
          } catch {
            // Skip malformed legacy geometry without breaking the whole map.
          }
        }
      }

      if (markers.length) {
        const markerSource = new ol.source.Vector();
        for (const marker of markers) {
          let coordinates: [number, number] | null = null;
          if (simple && marker.coordinate_mode === "xy" && marker.x != null && marker.y != null) coordinates = [marker.x, marker.y];
          if (!simple && marker.lat != null && marker.lng != null) coordinates = ol.proj.fromLonLat([marker.lng, marker.lat]);
          if (!coordinates) continue;
          const markerId = Number(marker.marker_id);
          const feature = new ol.Feature({ geometry: new ol.geom.Point(coordinates) });
          feature.setProperties({
            markerId,
            label: marker.entity_label || marker.label,
            subtitle: marker.short_description || marker.label,
            markerType: marker.marker_type,
            entityType: marker.entity_type,
            entityId: marker.entity_id,
          });
          markerSource.addFeature(feature);
          markerRefs.current.set(markerId, feature);
        }
        renderedLayers.push(new ol.layer.Vector({
          source: markerSource,
          zIndex: 10000,
          style: (feature: any) => new ol.style.Style({
            image: new ol.style.Circle({
              radius: 10,
              fill: new ol.style.Fill({ color: "rgba(20,24,31,.9)" }),
              stroke: new ol.style.Stroke({ color: "#fff", width: 2 }),
            }),
            text: new ol.style.Text({
              text: MARKER_GLYPHS[String(feature.get("markerType"))] ?? "•",
              fill: new ol.style.Fill({ color: "#fff" }),
              offsetY: 1,
            }),
          }),
        }));
      }

      const view = simple
        ? new ol.View({ projection, center: ol.extent.getCenter(extent), zoom: 0, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom, extent })
        : new ol.View({ center: ol.proj.fromLonLat([mapConfig.centerLng ?? 0, mapConfig.centerLat ?? 0]), zoom: Math.max(mapConfig.minZoom, 2), minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom });
      const map = new ol.Map({ target: targetRef.current, layers: renderedLayers, view });
      mapRef.current = map;
      if (simple) view.fit(extent, { padding: [24, 24, 24, 24] });

      map.on("singleclick", (event: any) => {
        const hit = map.forEachFeatureAtPixel(event.pixel, (feature: any) => feature);
        if (!hit) {
          setSelection(null);
          return;
        }
        const featureId = Number(hit.get("featureId")) || null;
        const markerId = Number(hit.get("markerId")) || null;
        setSelection({
          label: String(hit.get("label") ?? "Kartenobjekt"),
          subtitle: hit.get("subtitle") ? String(hit.get("subtitle")) : null,
          href: null,
          featureId,
          markerId,
        });
      });

      if (focusFeatureId) focusFeature(focusFeatureId);
      else if (focusMarkerId) focusMarker(focusMarkerId);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Karte konnte nicht geladen werden."));

    return () => {
      active = false;
      mapRef.current?.setTarget(undefined);
      mapRef.current = null;
      layerRefs.current.clear();
      featureRefs.current.clear();
      markerRefs.current.clear();
    };
  }, [mapConfig, rasterLayers, vectorLayers, features, markers, focusFeatureId, focusMarkerId]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const fallback = localSearch(features, markers, term);
    if (!searchEndpoint || term.length < 2) {
      setResults(fallback);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const separator = searchEndpoint.includes("?") ? "&" : "?";
        const response = await fetch(`${searchEndpoint}${separator}q=${encodeURIComponent(term)}`, { signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Kartensuche fehlgeschlagen.");
        setResults(Array.isArray(body.items) ? body.items : fallback);
      } catch (cause) {
        if ((cause as Error).name !== "AbortError") setResults(fallback);
      } finally {
        setSearching(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, searchEndpoint, features, markers]);

  function chooseResult(item: MapSearchItem) {
    let focused = false;
    if (item.featureId) focused = focusFeature(item.featureId);
    if (!focused && item.markerId) focused = focusMarker(item.markerId);
    if (!focused && item.href) window.location.assign(item.href);
    setQuery(item.name);
    setResults([]);
  }

  function toggleLayer(id: number, visible: boolean) {
    layerRefs.current.get(id)?.setVisible(visible);
    setActivePreset("custom");
  }

  return (
    <div className="stack">
      <style>{`
        .world-map-layout{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:12px;align-items:start}
        .world-map-sidebar{display:grid;gap:10px;max-height:68vh;overflow:auto;padding-right:2px}
        .world-map-search-results{display:grid;gap:4px;margin-top:6px}
        .world-map-search-result{width:100%;text-align:left;display:flex;justify-content:space-between;gap:8px;align-items:center}
        @media(max-width:900px){.world-map-layout{grid-template-columns:1fr}.world-map-sidebar{max-height:none;overflow:visible}}
      `}</style>
      <div className="world-map-layout">
        <aside className="world-map-sidebar">
          {showSearch ? <section className="panel-card stack">
            <div><span className="panel-kicker">KARTENSUCHE</span><h3 style={{ marginBottom: 4 }}>In der Welt finden</h3></div>
            <label>
              Suche
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Land, Stadt, NPC oder Ort …" />
            </label>
            {searching ? <small className="muted">Suche …</small> : null}
            {results.length ? <div className="world-map-search-results">{results.map((item, index) => (
              <button key={`${item.kind}-${item.id}-${index}`} type="button" className="button ghost world-map-search-result" onClick={() => chooseResult(item)}>
                <span><strong>{item.name}</strong>{item.subtitle ? <><br/><small className="muted">{item.subtitle}</small></> : null}</span>
                <span className="soft-label">{kindLabel(item.kind)}</span>
              </button>
            ))}</div> : query.trim() && !searching ? <small className="muted">Keine sichtbaren Treffer auf dieser Karte.</small> : null}
          </section> : null}

          <section className="panel-card stack">
            <div><span className="panel-kicker">ANSICHT</span><h3 style={{ marginBottom: 4 }}>Kartenmodus</h3></div>
            <div className="row wrap-row">{PRESETS.map((preset) => (
              <button key={preset.id} type="button" className={activePreset === preset.id ? "button primary" : "button ghost"} onClick={() => applyPreset(preset.id)}>{preset.label}</button>
            ))}</div>
          </section>

          <details className="panel-card" open>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Kartenebenen</summary>
            <div className="stack" style={{ paddingTop: 10 }}>
              {layers.map((layer) => {
                const id = Number(layer.layer_id);
                const satelliteIsBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath);
                return <label key={layer.layer_id} className="row" style={{ justifyContent: "space-between" }}>
                  <span>{layer.name}{satelliteIsBase ? " · Basiskarte" : ""}</span>
                  <input data-world-map-layer={id} type="checkbox" defaultChecked={satelliteIsBase || layer.visible_by_default} disabled={satelliteIsBase} onChange={(event) => toggleLayer(id, event.target.checked)} />
                </label>;
              })}
            </div>
          </details>

          {selection ? <section className="panel-card stack">
            <div><span className="panel-kicker">AUSGEWÄHLT</span><h3 style={{ marginBottom: 4 }}>{selection.label}</h3></div>
            {selection.subtitle ? <p className="muted" style={{ margin: 0 }}>{selection.subtitle}</p> : null}
            {selection.href ? <a className="button primary" href={selection.href}>Details öffnen</a> : null}
          </section> : null}
        </aside>

        <div className="stack">
          <div ref={targetRef} style={{ height, minHeight: 460, borderRadius: 12, overflow: "hidden", background: "#10141a" }} />
          {error ? <div className="error-message" aria-live="assertive">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}
