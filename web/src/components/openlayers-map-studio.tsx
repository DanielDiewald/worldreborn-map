"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type LayerRow = {
  layer_id: string;
  name: string;
  layer_type: "raster" | "vector";
  source_type: "image" | "tile" | "geojson" | "drawn" | "media";
  source_url: string | null;
  media_id: string | null;
  layer_role: string | null;
  opacity: number;
  z_index: number;
  visible_by_default: boolean;
  style: Record<string, unknown>;
  config: Record<string, unknown>;
  locked: boolean;
};

type FeatureRow = {
  feature_id: string;
  layer_id: string;
  geometry: { type: string; coordinates: unknown };
  entity_type: string | null;
  entity_id: string | null;
  label: string;
  short_description: string | null;
  visibility_mode: string;
  style: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

type LocationOption = { loc_id: number; name: string; location_kind: string; parent_name: string | null };
type OlGlobal = Record<string, any>;
type QuickPreset = "country" | "province" | "city" | "river" | "road";

declare global {
  interface Window {
    ol?: OlGlobal;
  }
}

const OL_JS = "https://cdn.jsdelivr.net/npm/ol@10.6.1/dist/ol.js";
const OL_CSS = "https://cdn.jsdelivr.net/npm/ol@10.6.1/ol.css";
const LOCATION_KINDS = ["country", "region", "province", "city", "town", "village", "district", "building", "landmark", "wilderness", "other"] as const;
const LOCATION_KIND_LABELS: Record<string, string> = {
  country: "Land",
  region: "Region",
  province: "Provinz",
  city: "Stadt",
  town: "Kleinstadt",
  village: "Dorf",
  district: "Stadtteil / Bezirk",
  building: "Gebäude",
  landmark: "Landmarke",
  wilderness: "Wildnis",
  other: "Sonstiger Ort",
};

async function ensureOpenLayers() {
  if (window.ol) return window.ol;
  if (!document.querySelector(`link[href="${OL_CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = OL_CSS;
    document.head.appendChild(link);
  }

  return new Promise<OlGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OL_JS}"]`);
    const script = existing ?? document.createElement("script");
    const loaded = () => window.ol ? resolve(window.ol) : reject(new Error("OpenLayers konnte nicht geladen werden."));
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", () => reject(new Error("OpenLayers konnte nicht geladen werden.")), { once: true });
    if (!existing) {
      script.src = OL_JS;
      script.crossOrigin = "anonymous";
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

function color(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function rgba(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return `rgba(124,110,230,${alpha})`;
  const n = Number.parseInt(clean, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

function presetLabel(preset: QuickPreset | null) {
  if (preset === "country") return "Land";
  if (preset === "province") return "Provinz";
  if (preset === "city") return "Stadt";
  if (preset === "river") return "Fluss";
  if (preset === "road") return "Straße";
  return null;
}

export function OpenLayersMapStudio({
  projectId,
  mapConfig,
  layers,
  features,
  locations,
}: {
  projectId: number;
  mapConfig: MapConfig;
  layers: LayerRow[];
  features: FeatureRow[];
  locations: LocationOption[];
}) {
  const targetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const drawRef = useRef<any>(null);
  const selectRef = useRef<any>(null);
  const modifyRef = useRef<any>(null);
  const sourceRefs = useRef(new Map<number, any>());
  const layerRefs = useRef(new Map<number, any>());
  const rowRefs = useRef(new Map<number, FeatureRow>());
  const layerSaveTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const vectorLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "vector"), [layers]);
  const rasterLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "raster"), [layers]);
  const contentLayers = useMemo(() => layers.filter((layer) => layer.layer_type === "vector"), [layers]);

  const [mode, setMode] = useState<"select" | "Point" | "LineString" | "Polygon">("select");
  const [activePreset, setActivePreset] = useState<QuickPreset | null>(null);
  const [layerId, setLayerId] = useState(() => Number(vectorLayers[0]?.layer_id ?? 0));
  const [label, setLabel] = useState("");
  const [locationKind, setLocationKind] = useState<string>("country");
  const [createLocation, setCreateLocation] = useState(true);
  const [parentLocationId, setParentLocationId] = useState("");
  const [fillColor, setFillColor] = useState("#7c6ee6");
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>(locations);
  const [selectedFeatureId, setSelectedFeatureId] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  function scheduleLayerPatch(id: number, patch: Record<string, unknown>) {
    const previous = layerSaveTimers.current.get(id);
    if (previous) clearTimeout(previous);
    layerSaveTimers.current.set(id, setTimeout(async () => {
      const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/layers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error || "Ebenen-Einstellung konnte nicht gespeichert werden.");
      }
    }, 300));
  }

  async function persistGeometry(feature: any) {
    const featureId = Number(feature.get("featureId"));
    if (!featureId) return;
    const row = rowRefs.current.get(featureId);
    if (!row) return;
    const ol = await ensureOpenLayers();
    const geometry = new ol.format.GeoJSON().writeGeometryObject(feature.getGeometry());
    const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${featureId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layerId: Number(row.layer_id),
        geometry,
        entityType: row.entity_type,
        entityId: row.entity_id ? Number(row.entity_id) : null,
        label: row.label,
        shortDescription: row.short_description,
        visibilityMode: row.visibility_mode,
        selectedPlayerIds: [],
        style: row.style ?? {},
        metadata: row.metadata ?? {},
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Geometrie konnte nicht gespeichert werden.");
    }
    row.geometry = geometry;
    setStatus(`„${row.label}“ aktualisiert.`);
  }

  async function persistFeatureRow(row: FeatureRow) {
    const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${row.feature_id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        layerId: Number(row.layer_id),
        geometry: row.geometry,
        entityType: row.entity_type,
        entityId: row.entity_id ? Number(row.entity_id) : null,
        label: row.label,
        shortDescription: row.short_description,
        visibilityMode: row.visibility_mode,
        selectedPlayerIds: [],
        style: row.style ?? {},
        metadata: row.metadata ?? {},
      }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Element konnte nicht gespeichert werden.");
    }
  }

  useEffect(() => {
    setLocationOptions(locations);
  }, [locations]);

  useEffect(() => {
    let active = true;
    ensureOpenLayers().then((ol) => {
      if (!active || !targetRef.current) return;
      const simple = mapConfig.mapType === "image";
      const bounds = parseBounds(mapConfig.bounds) ?? [[0, 0], [4096, 8192]];
      const extent = [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]];
      const projection = simple
        ? new ol.proj.Projection({ code: `WORLDREBORN:${mapConfig.mapId}`, units: "pixels", extent })
        : undefined;
      const mapLayers: any[] = [];

      if (simple && mapConfig.imagePath) {
        const url = mapConfig.imagePath.startsWith("/") ? mapConfig.imagePath : `/api/media/${mapConfig.imagePath}`;
        mapLayers.push(new ol.layer.Image({
          zIndex: -1000,
          source: new ol.source.ImageStatic({ url, projection, imageExtent: extent }),
        }));
      } else if (mapConfig.tileUrl) {
        mapLayers.push(new ol.layer.Tile({
          zIndex: -1000,
          source: new ol.source.XYZ({
            url: mapConfig.tileUrl,
            wrapX: false,
            minZoom: mapConfig.minZoom,
            maxZoom: mapConfig.maxZoom,
          }),
        }));
      }

      for (const layer of rasterLayers) {
        const id = Number(layer.layer_id);
        const isSatelliteBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath);
        if (isSatelliteBase) continue;
        const url = layer.source_type === "media" && layer.media_id ? `/api/media/${layer.media_id}` : layer.source_url;
        if (!url) continue;

        let olLayer: any = null;
        if ((layer.source_type === "image" || layer.source_type === "media") && simple) {
          olLayer = new ol.layer.Image({
            opacity: layer.opacity,
            zIndex: layer.z_index,
            visible: layer.visible_by_default,
            source: new ol.source.ImageStatic({ url, projection, imageExtent: extent }),
          });
        } else if (layer.source_type === "tile") {
          olLayer = new ol.layer.Tile({
            opacity: layer.opacity,
            zIndex: layer.z_index,
            visible: layer.visible_by_default,
            source: new ol.source.XYZ({ url, wrapX: false }),
          });
        }

        if (olLayer) {
          olLayer.set("worldrebornLayerId", id);
          layerRefs.current.set(id, olLayer);
          mapLayers.push(olLayer);
        }
      }

      const geojson = new ol.format.GeoJSON();
      for (const layer of vectorLayers) {
        const id = Number(layer.layer_id);
        const source = new ol.source.Vector();
        sourceRefs.current.set(id, source);
        const fill = color(layer.style?.fill, "#7c6ee6");
        const stroke = color(layer.style?.stroke, "#f3f4f6");
        const strokeWidth = Number(layer.style?.strokeWidth ?? 2);
        const vectorLayer = new ol.layer.Vector({
          source,
          zIndex: layer.z_index || 500,
          visible: layer.visible_by_default,
          opacity: layer.opacity,
          style: (feature: any) => {
            const geometryType = feature.getGeometry()?.getType();
            const featureId = Number(feature.get("featureId"));
            const row = featureId ? rowRefs.current.get(featureId) : null;
            const featureFill = color(row?.style?.fill, fill);
            const featureStroke = color(row?.style?.stroke, stroke);
            return new ol.style.Style({
              fill: geometryType?.includes("Polygon") ? new ol.style.Fill({ color: rgba(featureFill, 0.32) }) : undefined,
              stroke: new ol.style.Stroke({ color: featureStroke, width: Number(row?.style?.strokeWidth ?? strokeWidth) }),
              image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: featureFill }),
                stroke: new ol.style.Stroke({ color: featureStroke, width: 2 }),
              }),
              text: feature.get("label")
                ? new ol.style.Text({
                    text: String(feature.get("label")),
                    offsetY: -12,
                    fill: new ol.style.Fill({ color: "#fff" }),
                    stroke: new ol.style.Stroke({ color: "#111", width: 3 }),
                  })
                : undefined,
            });
          },
        });
        vectorLayer.set("worldrebornLayerId", id);
        layerRefs.current.set(id, vectorLayer);
        mapLayers.push(vectorLayer);
      }

      for (const row of features) {
        try {
          const id = Number(row.feature_id);
          rowRefs.current.set(id, { ...row });
          const feature = geojson.readFeature({
            type: "Feature",
            geometry: row.geometry,
            properties: { featureId: id, label: row.label, layerId: Number(row.layer_id) },
          });
          sourceRefs.current.get(Number(row.layer_id))?.addFeature(feature);
        } catch {
          // Malformed legacy geometry is skipped.
        }
      }

      const view = simple
        ? new ol.View({
            projection,
            center: ol.extent.getCenter(extent),
            zoom: 0,
            minZoom: mapConfig.minZoom,
            maxZoom: mapConfig.maxZoom,
            extent,
          })
        : new ol.View({
            center: ol.proj.fromLonLat([mapConfig.centerLng ?? 0, mapConfig.centerLat ?? 0]),
            zoom: Math.max(mapConfig.minZoom, 2),
            minZoom: mapConfig.minZoom,
            maxZoom: mapConfig.maxZoom,
          });

      const map = new ol.Map({ target: targetRef.current, layers: mapLayers, view });
      mapRef.current = map;
      if (simple) view.fit(extent, { padding: [20, 20, 20, 20] });

      const select = new ol.interaction.Select({
        layers: (candidate: any) => Boolean(candidate.get("worldrebornLayerId")) && sourceRefs.current.has(Number(candidate.get("worldrebornLayerId"))),
      });
      selectRef.current = select;
      map.addInteraction(select);
      select.on("select", (event: any) => {
        setSelectedFeatureId(event.selected?.[0] ? Number(event.selected[0].get("featureId")) : null);
      });

      const modify = new ol.interaction.Modify({ features: select.getFeatures(), pixelTolerance: 14 });
      modifyRef.current = modify;
      map.addInteraction(modify);
      modify.on("modifyend", async (event: any) => {
        setError("");
        try {
          for (const feature of event.features.getArray()) await persistGeometry(feature);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "Änderung konnte nicht gespeichert werden.");
        }
      });

      for (const source of sourceRefs.current.values()) {
        map.addInteraction(new ol.interaction.Snap({ source, pixelTolerance: 14 }));
      }
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Karte konnte nicht geladen werden."));

    return () => {
      active = false;
      for (const timer of layerSaveTimers.current.values()) clearTimeout(timer);
      layerSaveTimers.current.clear();
      mapRef.current?.setTarget(undefined);
      mapRef.current = null;
      sourceRefs.current.clear();
      layerRefs.current.clear();
      rowRefs.current.clear();
    };
  }, [mapConfig, rasterLayers, vectorLayers, features]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    ensureOpenLayers().then((ol) => {
      if (drawRef.current) {
        map.removeInteraction(drawRef.current);
        drawRef.current = null;
      }
      if (mode === "select") return;

      const source = sourceRefs.current.get(layerId);
      if (!source) {
        setError("Bitte zuerst eine Zeichenebene auswählen.");
        return;
      }

      selectRef.current?.setActive(false);
      modifyRef.current?.setActive(false);
      const draw = new ol.interaction.Draw({
        source,
        type: mode,
        snapTolerance: 14,
        trace: mode !== "Point",
        traceSource: source,
      });
      drawRef.current = draw;
      map.addInteraction(draw);

      draw.on("drawend", async (event: any) => {
        setError("");
        const featureLabel = label.trim();
        if (!featureLabel) {
          setError("Bitte vor dem Zeichnen einen Namen eingeben.");
          source.removeFeature(event.feature);
          return;
        }

        try {
          const geometry = new ol.format.GeoJSON().writeGeometryObject(event.feature.getGeometry());
          const style = mode === "LineString" ? { stroke: fillColor } : { fill: fillColor };
          const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              layerId,
              geometry,
              label: featureLabel,
              visibilityMode: "admin_only",
              selectedPlayerIds: [],
              style,
              metadata: { createdIn: "map-editor-v2" },
              createLocation: createLocation
                ? {
                    kind: locationKind,
                    parentLocationId: parentLocationId ? Number(parentLocationId) : null,
                    locationType: locationKind,
                  }
                : null,
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "Element konnte nicht gespeichert werden.");

          const row: FeatureRow = {
            feature_id: String(body.featureId),
            layer_id: String(layerId),
            geometry,
            entity_type: body.locationId ? "location" : null,
            entity_id: body.locationId ? String(body.locationId) : null,
            label: featureLabel,
            short_description: null,
            visibility_mode: "admin_only",
            style,
            metadata: { createdIn: "map-editor-v2" },
          };
          rowRefs.current.set(Number(body.featureId), row);
          event.feature.set("featureId", Number(body.featureId));
          event.feature.set("label", featureLabel);
          event.feature.set("layerId", layerId);

          if (body.locationId) {
            setLocationOptions((current) => [
              ...current,
              {
                loc_id: Number(body.locationId),
                name: featureLabel,
                location_kind: locationKind,
                parent_name: locationOptions.find((location) => location.loc_id === Number(parentLocationId))?.name ?? null,
              },
            ].sort((a, b) => a.name.localeCompare(b.name)));
          }

          setStatus(
            body.locationId
              ? `„${featureLabel}“ gespeichert und als ${LOCATION_KIND_LABELS[locationKind] ?? locationKind} angelegt.`
              : `„${featureLabel}“ gespeichert.`,
          );
          setLabel("");
        } catch (cause) {
          source.removeFeature(event.feature);
          setError(cause instanceof Error ? cause.message : "Element konnte nicht gespeichert werden.");
        }
      });
    });

    return () => {
      if (map && drawRef.current) {
        map.removeInteraction(drawRef.current);
        drawRef.current = null;
      }
      selectRef.current?.setActive(true);
      modifyRef.current?.setActive(true);
    };
  }, [mode, layerId, label, createLocation, locationKind, parentLocationId, fillColor, mapConfig.mapId, projectId, locationOptions]);

  async function deleteSelected() {
    if (!selectedFeatureId) return;
    const row = rowRefs.current.get(selectedFeatureId);
    if (!row) return;
    if (!window.confirm(`„${row.label}“ wirklich von der Karte löschen? Die verknüpfte Location bleibt erhalten.`)) return;

    setError("");
    const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${selectedFeatureId}`, { method: "DELETE" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || "Element konnte nicht gelöscht werden.");
      return;
    }

    const source = sourceRefs.current.get(Number(row.layer_id));
    for (const feature of source?.getFeatures() ?? []) {
      if (Number(feature.get("featureId")) === selectedFeatureId) source.removeFeature(feature);
    }
    rowRefs.current.delete(selectedFeatureId);
    selectRef.current?.getFeatures().clear();
    setSelectedFeatureId(null);
    setStatus(`„${row.label}“ von der Karte entfernt.`);
  }

  async function changeSelectedColor(next: string) {
    if (!selectedFeatureId) return;
    const row = rowRefs.current.get(selectedFeatureId);
    if (!row) return;
    const styleKey = row.geometry.type.includes("Line") ? "stroke" : "fill";
    row.style = { ...row.style, [styleKey]: next };
    setError("");
    try {
      await persistFeatureRow(row);
      sourceRefs.current.get(Number(row.layer_id))?.changed();
      setStatus(`Farbe von „${row.label}“ gespeichert.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Farbe konnte nicht gespeichert werden.");
    }
  }

  function toggleLayer(id: number, visible: boolean) {
    layerRefs.current.get(id)?.setVisible(visible);
    scheduleLayerPatch(id, { visibleByDefault: visible });
  }

  function setOpacity(id: number, value: number) {
    layerRefs.current.get(id)?.setOpacity(value);
    scheduleLayerPatch(id, { opacity: value });
  }

  function choosePreset(preset: QuickPreset) {
    setError("");
    setActivePreset(preset);

    if (preset === "country" || preset === "province") {
      setMode("Polygon");
      setCreateLocation(true);
      setLocationKind(preset);
      setFillColor(preset === "country" ? "#7c6ee6" : "#9a8be8");
      const target = vectorLayers.find((layer) => layer.layer_role === "political") ?? vectorLayers[0];
      if (target) setLayerId(Number(target.layer_id));
      return;
    }

    if (preset === "city") {
      setMode("Point");
      setCreateLocation(true);
      setLocationKind("city");
      setFillColor("#f0b35a");
      const target = vectorLayers.find((layer) => layer.layer_role === "settlements") ?? vectorLayers[0];
      if (target) setLayerId(Number(target.layer_id));
      return;
    }

    setMode("LineString");
    setCreateLocation(false);
    setFillColor(preset === "river" ? "#67a9cf" : "#c79a63");
    const target = vectorLayers.find((layer) => layer.layer_role === "routes") ?? vectorLayers[0];
    if (target) setLayerId(Number(target.layer_id));
  }

  function chooseManualMode(next: "select" | "Point" | "LineString" | "Polygon") {
    setActivePreset(null);
    setMode(next);
  }

  const selectedRow = selectedFeatureId ? rowRefs.current.get(selectedFeatureId) : null;
  const currentPresetLabel = presetLabel(activePreset);

  return (
    <>
      <style>{`
        .worldreborn-map-editor { display:grid; grid-template-columns:minmax(240px,320px) minmax(0,1fr); gap:14px; align-items:start; }
        .worldreborn-map-editor-sidebar { max-height:76vh; overflow:auto; padding-right:4px; }
        @media (max-width: 900px) {
          .worldreborn-map-editor { grid-template-columns:1fr; }
          .worldreborn-map-editor-sidebar { max-height:none; overflow:visible; padding-right:0; }
        }
      `}</style>

      <div className="worldreborn-map-editor">
        <aside className="stack worldreborn-map-editor-sidebar">
          <section className="panel-card stack">
            <div>
              <span className="panel-kicker">1 · WAS MÖCHTEST DU EINZEICHNEN?</span>
              <h3 style={{ marginBottom: 6 }}>Element wählen</h3>
              <p className="muted" style={{ margin: 0 }}>WorldReborn wählt Werkzeug und Ebene automatisch.</p>
            </div>
            <div className="row wrap-row">
              {(["country", "province", "city", "river", "road"] as QuickPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={activePreset === preset ? "button primary" : "button ghost"}
                  onClick={() => choosePreset(preset)}
                >
                  {presetLabel(preset)}
                </button>
              ))}
            </div>
            <small className="muted">
              Bei Ländern und Provinzen kannst du vorhandene Grenzen anklicken und nachzeichnen. Dadurch teilen Nachbarländer exakt dieselbe Grenze.
            </small>
          </section>

          <section className="panel-card stack">
            <div>
              <span className="panel-kicker">2 · DETAILS</span>
              <h3 style={{ marginBottom: 6 }}>{currentPresetLabel ? `${currentPresetLabel} anlegen` : "Element beschreiben"}</h3>
            </div>
            <label>
              Name
              <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="z. B. Königreich Erigon" />
            </label>
            <label>
              Farbe
              <div className="row">
                <input type="color" value={fillColor} onChange={(event) => setFillColor(event.target.value)} />
                <span className="muted">{fillColor}</span>
              </div>
            </label>

            {createLocation ? (
              <>
                <label>
                  Gehört zu
                  <select value={parentLocationId} onChange={(event) => setParentLocationId(event.target.value)}>
                    <option value="">— kein übergeordneter Ort —</option>
                    {locationOptions.map((location) => (
                      <option key={location.loc_id} value={location.loc_id}>
                        {location.parent_name ? `${location.parent_name} → ` : ""}{location.name} ({LOCATION_KIND_LABELS[location.location_kind] ?? location.location_kind})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="muted">
                  Wird gleichzeitig als <strong>{LOCATION_KIND_LABELS[locationKind] ?? locationKind}</strong> in deinen Locations gespeichert.
                </div>
              </>
            ) : (
              <div className="muted">Straßen und Flüsse werden als Kartenlinien gespeichert und erzeugen keine Location.</div>
            )}

            {mode === "select" ? (
              <div className="notice">Wähle oben zuerst Land, Provinz, Stadt, Fluss oder Straße.</div>
            ) : !label.trim() ? (
              <div className="notice">Gib einen Namen ein, dann zeichne direkt auf der Karte.</div>
            ) : (
              <div className="success-message">Bereit: jetzt auf der Karte zeichnen.</div>
            )}
          </section>

          <section className="panel-card stack">
            <div>
              <span className="panel-kicker">KARTENANSICHT</span>
              <h3 style={{ marginBottom: 6 }}>Kartenebenen</h3>
              <p className="muted" style={{ margin: 0 }}>Blende Klima, Terrain oder deine Inhalte ein und aus.</p>
            </div>

            {rasterLayers.length ? <strong className="muted">Rock-3-Daten</strong> : null}
            {rasterLayers.map((layer) => {
              const id = Number(layer.layer_id);
              const isBase = layer.layer_role === "satellite" && layer.media_id != null && String(layer.media_id) === String(mapConfig.imagePath);
              return (
                <div key={layer.layer_id} style={{ display: "grid", gap: 5, borderTop: "1px solid rgba(127,127,127,.25)", paddingTop: 8 }}>
                  <label className="row">
                    <input
                      type="checkbox"
                      defaultChecked={isBase || layer.visible_by_default}
                      disabled={isBase}
                      onChange={(event) => toggleLayer(id, event.target.checked)}
                    />
                    <span>{layer.name}{isBase ? " · Basiskarte" : ""}</span>
                  </label>
                  {!isBase ? (
                    <label className="row muted">
                      Transparenz
                      <input
                        aria-label={`${layer.name} Transparenz`}
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        defaultValue={layer.opacity}
                        onChange={(event) => setOpacity(id, Number(event.target.value))}
                      />
                    </label>
                  ) : null}
                </div>
              );
            })}

            {contentLayers.length ? <strong className="muted" style={{ marginTop: 6 }}>Eigene Inhalte</strong> : null}
            {contentLayers.map((layer) => {
              const id = Number(layer.layer_id);
              return (
                <div key={layer.layer_id} style={{ display: "grid", gap: 5, borderTop: "1px solid rgba(127,127,127,.25)", paddingTop: 8 }}>
                  <label className="row">
                    <input type="checkbox" defaultChecked={layer.visible_by_default} onChange={(event) => toggleLayer(id, event.target.checked)} />
                    <span>{layer.name}</span>
                  </label>
                  <label className="row muted">
                    Deckkraft
                    <input
                      aria-label={`${layer.name} Deckkraft`}
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      defaultValue={layer.opacity}
                      onChange={(event) => setOpacity(id, Number(event.target.value))}
                    />
                  </label>
                </div>
              );
            })}
          </section>

          {selectedRow ? (
            <section className="panel-card stack">
              <div>
                <span className="panel-kicker">AUSGEWÄHLT</span>
                <h3 style={{ marginBottom: 4 }}>{selectedRow.label}</h3>
                <p className="muted" style={{ margin: 0 }}>Ziehe die Eckpunkte auf der Karte, um die Form zu ändern. Änderungen werden automatisch gespeichert.</p>
              </div>
              <label>
                Farbe
                <input
                  type="color"
                  defaultValue={color(selectedRow.style?.[selectedRow.geometry.type.includes("Line") ? "stroke" : "fill"], "#7c6ee6")}
                  onChange={(event) => void changeSelectedColor(event.target.value)}
                />
              </label>
              {selectedRow.entity_type === "location" && selectedRow.entity_id ? (
                <a className="button ghost" href={`/admin/projects/${projectId}/locations/${selectedRow.entity_id}`}>Location öffnen</a>
              ) : null}
              <button type="button" className="button danger" onClick={deleteSelected}>Nur von der Karte entfernen</button>
              {selectedRow.entity_type === "location" ? <small className="muted">Die verknüpfte Location wird dabei nicht gelöscht.</small> : null}
            </section>
          ) : null}

          <details className="panel-card">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Erweiterte Zeichenwerkzeuge</summary>
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="row wrap-row">
                <button type="button" className={mode === "select" && !activePreset ? "button primary" : "button ghost"} onClick={() => chooseManualMode("select")}>Auswählen</button>
                <button type="button" className={mode === "Point" && !activePreset ? "button primary" : "button ghost"} onClick={() => chooseManualMode("Point")}>Punkt</button>
                <button type="button" className={mode === "LineString" && !activePreset ? "button primary" : "button ghost"} onClick={() => chooseManualMode("LineString")}>Linie</button>
                <button type="button" className={mode === "Polygon" && !activePreset ? "button primary" : "button ghost"} onClick={() => chooseManualMode("Polygon")}>Polygon</button>
              </div>
              <label>
                Zeichenebene
                <select value={layerId || ""} onChange={(event) => setLayerId(Number(event.target.value))}>
                  <option value="">Ebene wählen</option>
                  {vectorLayers.map((layer) => <option key={layer.layer_id} value={layer.layer_id}>{layer.name}</option>)}
                </select>
              </label>
              <label className="row">
                <input type="checkbox" checked={createLocation} onChange={(event) => setCreateLocation(event.target.checked)} />
                Gleichzeitig als Location speichern
              </label>
              {createLocation ? (
                <label>
                  Location-Art
                  <select value={locationKind} onChange={(event) => setLocationKind(event.target.value)}>
                    {LOCATION_KINDS.map((kind) => <option key={kind} value={kind}>{LOCATION_KIND_LABELS[kind] ?? kind}</option>)}
                  </select>
                </label>
              ) : null}
              <small className="muted">Shift aktiviert beim Zeichnen den Freihandmodus.</small>
            </div>
          </details>
        </aside>

        <div className="stack">
          <div
            ref={targetRef}
            style={{ height: "76vh", minHeight: 560, borderRadius: 12, overflow: "hidden", background: "#10141a" }}
          />
          {status ? <div className="success-message" aria-live="polite">{status}</div> : null}
          {error ? <div className="error-message" aria-live="assertive">{error}</div> : null}
        </div>
      </div>
    </>
  );
}
