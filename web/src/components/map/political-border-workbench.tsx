"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ensureOpenLayers, mediaMapUrl, parseMapBounds } from "./openlayers-runtime";
import {
  randomizeSharedPoliticalBorder,
  sharedBorderNeighbors,
  smoothSharedPoliticalBorder,
  type BorderShapeResult,
} from "./map-border-shaping";
import { fitCountryAroundExistingCountries } from "./map-country-fit";
import { clipPolygonToLandMask } from "./map-raster-clip";
import { loadLandMaskGuide } from "./land-mask-runtime";
import type { JsonMapGeometry, LandMaskGuide, MapExtent } from "./map-geometry-guides";
import type { WorldMapConfig, WorldMapFeature, WorldMapLayer } from "./map-types";
import styles from "./map-workspace.module.css";

type Mode = "smooth" | "random";
type Workflow = "shape" | "create";
type MaskState = "missing" | "loading" | "ready" | "error";

function isCountry(row: WorldMapFeature) {
  return row.location_kind === "country" && ["Polygon", "MultiPolygon"].includes(row.geometry.type);
}
function isPolygonGeometry(value: unknown): value is JsonMapGeometry {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return type === "Polygon" || type === "MultiPolygon";
}

function colorFor(index: number) {
  const colors = ["#d6ad63", "#7bc7a4", "#8878e5", "#e07b70", "#75aee6", "#d889d2"];
  return colors[index % colors.length];
}

export function PoliticalBorderWorkbench({ projectId, mapConfig, layers, features, height = "100%" }: {
  projectId: number;
  mapConfig: WorldMapConfig;
  layers: WorldMapLayer[];
  features: WorldMapFeature[];
  height?: string;
}) {
  const initialCountries = useMemo(() => features.filter(isCountry), [features]);
  const politicalLayer = useMemo(() => layers.find((layer) => layer.layer_type === "vector" && layer.layer_role === "political") ?? layers.find((layer) => layer.layer_type === "vector") ?? null, [layers]);
  const landMaskLayer = useMemo(() => layers.find((layer) => layer.layer_type === "raster" && layer.layer_role === "land_mask"), [layers]);
  const mapExtent = useMemo<MapExtent>(() => {
    const bounds = parseMapBounds(mapConfig.bounds) ?? [[0, 0], [4096, 8192]];
    return [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]];
  }, [mapConfig.bounds]);
  const tolerance = useMemo(() => Math.max(0.6, Math.max(mapExtent[2] - mapExtent[0], mapExtent[3] - mapExtent[1]) / 4500), [mapExtent]);

  const [rows, setRows] = useState<WorldMapFeature[]>(initialCountries.map((row) => ({ ...row })));
  const [workflow, setWorkflow] = useState<Workflow>("shape");
  const [countryAId, setCountryAId] = useState<number | null>(initialCountries[0] ? Number(initialCountries[0].feature_id) : null);
  const countryA = rows.find((row) => Number(row.feature_id) === countryAId) ?? null;
  const neighbors = useMemo(() => countryA ? sharedBorderNeighbors(countryA, rows, tolerance) : [], [countryA, rows, tolerance]);
  const [countryBId, setCountryBId] = useState<number | null>(null);
  const countryB = neighbors.find((row) => Number(row.feature_id) === countryBId) ?? neighbors[0] ?? null;

  const [mode, setMode] = useState<Mode>("smooth");
  const [smoothness, setSmoothness] = useState(0.82);
  const [roughness, setRoughness] = useState(0.7);
  const [detail, setDetail] = useState(0.72);
  const [seed, setSeed] = useState(1337);
  const [preview, setPreview] = useState<BorderShapeResult | null>(null);

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#8b79df");
  const [drawingCountry, setDrawingCountry] = useState(false);
  const [countryPreview, setCountryPreview] = useState<JsonMapGeometry | null>(null);
  const [removedOverlapPixels, setRemovedOverlapPixels] = useState(0);
  const [landMaskState, setLandMaskState] = useState<MaskState>(landMaskLayer ? "loading" : "missing");

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Wähle zwei benachbarte Länder oder erstelle ein neues Land direkt neben bestehenden Flächen.");
  const [error, setError] = useState("");

  const targetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const sourceRef = useRef<any>(null);
  const previewSourceRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const drawRef = useRef<any>(null);
  const featureRefs = useRef(new Map<number, any>());
  const landMaskRef = useRef<LandMaskGuide | null>(null);

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
    if (!countryA) { setCountryBId(null); return; }
    if (!neighbors.length) { setCountryBId(null); return; }
    if (!neighbors.some((row) => Number(row.feature_id) === countryBId)) setCountryBId(Number(neighbors[0].feature_id));
  }, [countryAId, neighbors, countryBId, countryA]);

  useEffect(() => {
    setPreview(null);
    if (workflow === "shape") previewSourceRef.current?.clear();
  }, [countryAId, countryBId, mode, smoothness, roughness, detail, workflow]);

  useEffect(() => {
    let active = true;
    ensureOpenLayers().then((ol) => {
      if (!active || !targetRef.current) return;
      featureRefs.current.clear();
      const simple = mapConfig.mapType === "image";
      const projection = simple ? new ol.proj.Projection({ code: `WORLDREBORN:BORDERS:${mapConfig.mapId}`, units: "pixels", extent: mapExtent }) : undefined;
      const olLayers: any[] = [];
      if (simple && mapConfig.imagePath) {
        const url = mediaMapUrl(mapConfig.imagePath);
        if (url) olLayers.push(new ol.layer.Image({ zIndex: -1000, source: new ol.source.ImageStatic({ url, projection, imageExtent: mapExtent }) }));
      } else if (mapConfig.tileUrl) {
        olLayers.push(new ol.layer.Tile({ zIndex: -1000, source: new ol.source.XYZ({ url: mapConfig.tileUrl, wrapX: false }) }));
      }

      const source = new ol.source.Vector();
      sourceRef.current = source;
      const vector = new ol.layer.Vector({
        source,
        zIndex: 500,
        style: (feature: any) => {
          const index = Number(feature.get("index") ?? 0);
          const selected = feature.get("selected") === true;
          const neighbor = feature.get("neighbor") === true;
          const color = feature.get("fill") || colorFor(index);
          return new ol.style.Style({
            fill: new ol.style.Fill({ color: selected || neighbor ? `${color}38` : `${color}22` }),
            stroke: new ol.style.Stroke({ color: selected || neighbor ? color : "rgba(235,235,235,.55)", width: selected || neighbor ? 3 : 1.5 }),
            text: new ol.style.Text({ text: String(feature.get("label") ?? ""), fill: new ol.style.Fill({ color: "#fff" }), stroke: new ol.style.Stroke({ color: "#111", width: 3 }) }),
          });
        },
      });
      layerRef.current = vector;
      olLayers.push(vector);

      const previewSource = new ol.source.Vector();
      previewSourceRef.current = previewSource;
      olLayers.push(new ol.layer.Vector({
        source: previewSource,
        zIndex: 10000,
        style: (feature: any) => {
          const side = feature.get("side");
          const color = side === "new" ? String(feature.get("fill") || newColor) : side === "a" ? "#f0c873" : "#8ee0b9";
          return new ol.style.Style({
            fill: new ol.style.Fill({ color: side === "new" ? `${color}40` : side === "a" ? "rgba(214,173,99,.18)" : "rgba(123,199,164,.18)" }),
            stroke: new ol.style.Stroke({ color, width: side === "new" ? 3 : 4, lineDash: side === "new" ? [9, 5] : undefined }),
          });
        },
      }));

      const format = new ol.format.GeoJSON();
      rows.forEach((row, index) => {
        try {
          const id = Number(row.feature_id);
          const feature = new ol.Feature({ geometry: format.readGeometry(row.geometry), featureId: id, label: row.label, index, fill: typeof row.style?.fill === "string" ? row.style.fill : colorFor(index) });
          source.addFeature(feature);
          featureRefs.current.set(id, feature);
        } catch { /* malformed legacy polygon stays out of the workbench */ }
      });

      const view = simple
        ? new ol.View({ projection, center: ol.extent.getCenter(mapExtent), zoom: 0, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom, extent: mapExtent })
        : new ol.View({ center: ol.proj.fromLonLat([mapConfig.centerLng ?? 0, mapConfig.centerLat ?? 0]), zoom: 3, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom });
      const map = new ol.Map({ target: targetRef.current, layers: olLayers, view });
      mapRef.current = map;
      if (simple) view.fit(mapExtent, { padding: [20, 20, 20, 20] });

      map.on("singleclick", (event: any) => {
        if (drawRef.current || workflow === "create") return;
        const hit = map.forEachFeatureAtPixel(event.pixel, (feature: any) => Number(feature.get("featureId")) || null, { hitTolerance: 8, layerFilter: (candidate: any) => candidate === vector });
        if (hit) setCountryAId(Number(hit));
      });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Grenzwerkzeug konnte nicht geladen werden."));
    return () => {
      active = false;
      if (drawRef.current && mapRef.current) mapRef.current.removeInteraction(drawRef.current);
      drawRef.current = null;
      mapRef.current?.setTarget(undefined); mapRef.current = null; sourceRef.current = null; previewSourceRef.current = null; featureRefs.current.clear();
    };
  // The map is intentionally initialized once per map. Geometry updates happen below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapConfig.mapId]);

  useEffect(() => {
    for (const row of rows) {
      const id = Number(row.feature_id);
      const feature = featureRefs.current.get(id);
      if (!feature) continue;
      feature.set("selected", workflow === "shape" && id === countryAId);
      feature.set("neighbor", workflow === "shape" && id === Number(countryB?.feature_id));
    }
    layerRef.current?.changed();
    if (workflow === "shape" && countryA && countryB && mapRef.current) {
      const a = featureRefs.current.get(Number(countryA.feature_id));
      const b = featureRefs.current.get(Number(countryB.feature_id));
      const extentA = a?.getGeometry()?.getExtent();
      const extentB = b?.getGeometry()?.getExtent();
      if (extentA && extentB) {
        const extent = [Math.min(extentA[0], extentB[0]), Math.min(extentA[1], extentB[1]), Math.max(extentA[2], extentB[2]), Math.max(extentA[3], extentB[3])];
        mapRef.current.getView().fit(extent, { padding: [80, 80, 80, 430], maxZoom: Math.min(mapConfig.maxZoom, 4), duration: 220 });
      }
    }
  }, [rows, countryAId, countryB, countryA, mapConfig.maxZoom, workflow]);

  async function renderPreview(result: BorderShapeResult | null) {
    setPreview(result);
    const source = previewSourceRef.current;
    if (!source) return;
    source.clear();
    if (!result) return;
    const ol = await ensureOpenLayers();
    const format = new ol.format.GeoJSON();
    source.addFeature(new ol.Feature({ geometry: format.readGeometry(result.aGeometry), side: "a" }));
    source.addFeature(new ol.Feature({ geometry: format.readGeometry(result.bGeometry), side: "b" }));
  }

  function buildPreview(nextSeed = seed) {
    if (!countryA || !countryB) { setError("Wähle zuerst zwei Länder mit einer gemeinsamen Grenze."); return; }
    setError("");
    const result = mode === "smooth"
      ? smoothSharedPoliticalBorder(countryA.geometry as JsonMapGeometry, countryB.geometry as JsonMapGeometry, { tolerance, smoothness, detail })
      : randomizeSharedPoliticalBorder(countryA.geometry as JsonMapGeometry, countryB.geometry as JsonMapGeometry, { tolerance, roughness, detail, seed: nextSeed });
    if (!result) { setError("Für diese beiden Länder konnte keine sichere gemeinsame Kurve erzeugt werden. Die Länder müssen eine wirklich gemeinsame gespeicherte Grenzkante besitzen."); void renderPreview(null); return; }
    setSeed(nextSeed);
    void renderPreview(result);
    setStatus(mode === "smooth" ? "Geglättete gemeinsame Grenze als Vorschau berechnet." : `Zufällige gemeinsame Grenze mit Seed ${nextSeed} als Vorschau berechnet.`);
  }

  function randomVariation() {
    const next = Math.max(1, (seed * 1664525 + 1013904223) % 2_147_483_647);
    buildPreview(next);
  }

  async function savePreview() {
    if (!preview || !countryA || !countryB || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features/${countryA.feature_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patchType: "geometry_batch", geometry: preview.aGeometry, peers: [{ featureId: Number(countryB.feature_id), geometry: preview.bGeometry }] }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok !== true) throw new Error(body.error || "Gemeinsame Grenze konnte nicht gespeichert werden.");
      const nextRows = rows.map((row) => Number(row.feature_id) === Number(countryA.feature_id) ? { ...row, geometry: preview.aGeometry } : Number(row.feature_id) === Number(countryB.feature_id) ? { ...row, geometry: preview.bGeometry } : row);
      setRows(nextRows);
      const ol = await ensureOpenLayers();
      const format = new ol.format.GeoJSON();
      featureRefs.current.get(Number(countryA.feature_id))?.setGeometry(format.readGeometry(preview.aGeometry));
      featureRefs.current.get(Number(countryB.feature_id))?.setGeometry(format.readGeometry(preview.bGeometry));
      previewSourceRef.current?.clear();
      setPreview(null);
      setStatus(`Gemeinsame Grenze zwischen „${countryA.label}“ und „${countryB.label}“ gespeichert.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gemeinsame Grenze konnte nicht gespeichert werden.");
    } finally { setSaving(false); }
  }

  function switchWorkflow(next: Workflow) {
    if (saving) return;
    if (drawRef.current && mapRef.current) mapRef.current.removeInteraction(drawRef.current);
    drawRef.current = null;
    setDrawingCountry(false); setWorkflow(next); setError(""); setPreview(null); setCountryPreview(null); setRemovedOverlapPixels(0); previewSourceRef.current?.clear();
    setStatus(next === "create" ? "Zeichne das neue Land grob über die gewünschte freie Fläche. Bestehende Länder dürfen überzeichnet werden." : "Wähle zwei benachbarte Länder mit einer gemeinsamen gespeicherten Grenze.");
  }

  async function showCountryPreview(geometry: JsonMapGeometry) {
    const source = previewSourceRef.current; if (!source) return;
    source.clear();
    const ol = await ensureOpenLayers();
    source.addFeature(new ol.Feature({ geometry: new ol.format.GeoJSON().readGeometry(geometry), side: "new", fill: newColor }));
  }

  async function startCountryDrawing() {
    if (!mapRef.current || !previewSourceRef.current || !sourceRef.current || !newName.trim() || saving) return;
    if (!politicalLayer) { setError("Es gibt keine politische Vektor-Ebene für neue Länder."); return; }
    if (drawRef.current) mapRef.current.removeInteraction(drawRef.current);
    setError(""); setCountryPreview(null); setRemovedOverlapPixels(0); previewSourceRef.current.clear(); setDrawingCountry(true);
    const ol = await ensureOpenLayers();
    const draw = new ol.interaction.Draw({ source: previewSourceRef.current, type: "Polygon", trace: true, traceSource: sourceRef.current, snapTolerance: 18 });
    drawRef.current = draw; mapRef.current.addInteraction(draw);
    const snap = new ol.interaction.Snap({ source: sourceRef.current, pixelTolerance: 18 });
    mapRef.current.addInteraction(snap);
    draw.on("drawend", async (event: any) => {
      mapRef.current?.removeInteraction(draw); mapRef.current?.removeInteraction(snap); drawRef.current = null; setDrawingCountry(false);
      try {
        const format = new ol.format.GeoJSON();
        let geometry = format.writeGeometryObject(event.feature.getGeometry()) as JsonMapGeometry;
        if (landMaskRef.current) geometry = clipPolygonToLandMask(geometry, landMaskRef.current);
        const fit = fitCountryAroundExistingCountries(geometry, rows.map((row) => row.geometry as JsonMapGeometry), 3200, 1);
        if (!fit || fit.keptPixels < 12) throw new Error("Nach dem Anpassen an vorhandene Länder bleibt keine ausreichende freie Fläche übrig. Zeichne weiter in die noch freie Landfläche.");
        setCountryPreview(fit.geometry); setRemovedOverlapPixels(fit.removedPixels); await showCountryPreview(fit.geometry);
        setStatus(fit.removedPixels > 0 ? `Vorschau angepasst: bereits belegte Länderfläche und ein sehr kleiner Sicherheitsrand wurden automatisch ausgespart.` : "Vorschau bereit. Es gab keine Überschneidung mit bestehenden Ländern.");
      } catch (cause) {
        previewSourceRef.current?.clear(); setCountryPreview(null); setError(cause instanceof Error ? cause.message : "Neues Land konnte nicht angepasst werden.");
      }
    });
  }

  async function saveCountry() {
    if (!countryPreview || !politicalLayer || !newName.trim() || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layerId: Number(politicalLayer.layer_id),
          geometry: countryPreview,
          entityType: null,
          entityId: null,
          label: newName.trim(),
          visibilityMode: "admin_only",
          selectedPlayerIds: [],
          style: { fill: newColor, stroke: "#ffffff", strokeWidth: 2 },
          metadata: { createdIn: "political-border-workbench", tool: "country", adaptToExistingCountries: true, geometryConformance: landMaskRef.current ? "land-mask-and-existing-countries" : "existing-countries", editorLocked: false },
          createLocation: { kind: "country", parentLocationId: null, locationType: "Land" },
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Land konnte nicht gespeichert werden.");
      const featureId = Number(body.featureId), locationId = body.locationId ? Number(body.locationId) : null;
      if (!Number.isSafeInteger(featureId) || featureId <= 0) throw new Error("Server hat keine gültige Feature-ID zurückgegeben.");
      const savedGeometry = isPolygonGeometry(body.geometry) ? body.geometry : countryPreview;
      const row: WorldMapFeature = {
        feature_id: String(featureId), layer_id: String(politicalLayer.layer_id), geometry: savedGeometry,
        entity_type: locationId ? "location" : null, entity_id: locationId ? String(locationId) : null,
        label: newName.trim(), short_description: null, visibility_mode: "admin_only",
        style: { fill: newColor, stroke: "#ffffff", strokeWidth: 2 },
        metadata: { createdIn: "political-border-workbench", tool: "country", adaptToExistingCountries: true, editorLocked: false },
        location_parent_id: null, location_kind: "country",
      };
      const nextRows = [...rows, row]; setRows(nextRows);
      const ol = await ensureOpenLayers(); const format = new ol.format.GeoJSON();
      const feature = new ol.Feature({ geometry: format.readGeometry(savedGeometry), featureId, label: row.label, index: nextRows.length - 1, fill: newColor });
      sourceRef.current?.addFeature(feature); featureRefs.current.set(featureId, feature); layerRef.current?.changed();
      previewSourceRef.current?.clear(); setCountryPreview(null); setRemovedOverlapPixels(0); setNewName("");
      const clearance = Number(body.autoFitClearancePixels ?? 0);
      setStatus(clearance > 0 ? `Land „${row.label}“ wurde erstellt. Der Server hat die Nachbargrenze mit einem kleinen Sicherheitsabstand konfliktfrei angepasst.` : `Land „${row.label}“ wurde erstellt und an die bereits belegten Länderflächen angepasst.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Land konnte nicht gespeichert werden.");
    } finally { setSaving(false); }
  }

  return <div className={styles.workspace} style={{ height }}>
    <div ref={targetRef} className={styles.canvas}/>
    <aside className={`${styles.createPanel} ${styles.glass}`} style={{ width: 400 }}>
      <div className={styles.panelHeader}>
        <div><span className={styles.kicker}>GRENZWERKZEUG</span><h3 className={styles.panelTitle}>{workflow === "shape" ? "Gemeinsame Grenze formen" : "Nachbarland zeichnen"}</h3><p className={styles.panelText}>{workflow === "shape" ? "Glätte bestehende Treppengrenzen oder erzeuge eine neue zufällige Grenze zwischen zwei Nachbarländern." : "Zeichne grob über die gewünschte Fläche. WorldReborn schneidet bestehende Länder automatisch aus dem neuen Land heraus."}</p></div>
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        <button type="button" className={`button ${workflow === "shape" ? "primary" : "ghost"}`} disabled={saving} onClick={() => switchWorkflow("shape")}>〰 Grenze formen</button>
        <button type="button" className={`button ${workflow === "create" ? "primary" : "ghost"}`} disabled={saving} onClick={() => switchWorkflow("create")}>＋ Nachbarland</button>
      </div>

      {workflow === "shape" ? !rows.length ? <div className={styles.drawHint}>Auf dieser Karte gibt es noch keine gezeichneten Länder.</div> : <div className={styles.fieldStack}>
        <label className={styles.field}>Land<select value={countryAId ?? ""} onChange={(event) => { setCountryAId(Number(event.target.value)); setPreview(null); }}><option value="" disabled>Land wählen</option>{rows.map((row) => <option key={row.feature_id} value={row.feature_id}>{row.label}</option>)}</select></label>
        <label className={styles.field}>Nachbarland<select value={countryB ? Number(countryB.feature_id) : ""} disabled={!neighbors.length} onChange={(event) => { setCountryBId(Number(event.target.value)); setPreview(null); }}><option value="" disabled>{neighbors.length ? "Nachbar wählen" : "Keine gemeinsame Grenzkante gefunden"}</option>{neighbors.map((row) => <option key={row.feature_id} value={row.feature_id}>{row.label}</option>)}</select></label>

        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={`button ${mode === "smooth" ? "primary" : "ghost"}`} onClick={() => setMode("smooth")}>⌁ Kurve glätten</button>
          <button type="button" className={`button ${mode === "random" ? "primary" : "ghost"}`} onClick={() => setMode("random")}>〰 Zufallsgrenze</button>
        </div>

        {mode === "smooth" ? <>
          <label className={styles.field}>Kurvenstärke <span className={styles.colorValue}>{Math.round(smoothness * 100)}%</span><input type="range" min="0.1" max="1" step="0.05" value={smoothness} onChange={(event) => { setSmoothness(Number(event.target.value)); setPreview(null); }}/></label>
          <p className={styles.panelText}>Entfernt die pixelartige Treppenform und berechnet zwischen den vorhandenen Grenzpunkten eine weichere gemeinsame Kurve.</p>
        </> : <>
          <label className={styles.field}>Welligkeit <span className={styles.colorValue}>{Math.round(roughness * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={roughness} onChange={(event) => { setRoughness(Number(event.target.value)); setPreview(null); }}/></label>
          <label className={styles.field}>Seed<input type="number" min="1" max="2147483647" value={seed} onChange={(event) => { setSeed(Math.max(1, Number(event.target.value) || 1)); setPreview(null); }}/></label>
        </>}
        <label className={styles.field}>Kurvendetail <span className={styles.colorValue}>{Math.round(detail * 100)}%</span><input type="range" min="0.15" max="1" step="0.05" value={detail} onChange={(event) => { setDetail(Number(event.target.value)); setPreview(null); }}/></label>

        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="button primary" disabled={!countryA || !countryB || saving} onClick={() => buildPreview()}>{preview ? "Vorschau neu berechnen" : "Vorschau erzeugen"}</button>
          {mode === "random" ? <button type="button" className="button ghost" disabled={!countryA || !countryB || saving} onClick={randomVariation}>↻ Andere Grenze</button> : null}
          {preview ? <button type="button" className="button ghost" disabled={saving} onClick={() => void renderPreview(null)}>Vorschau verwerfen</button> : null}
        </div>

        {preview ? <div className={styles.drawHint}><strong>Gemeinsame Kurve bereit.</strong><br/>Länge vorher ca. {preview.originalLength.toFixed(0)}, danach ca. {preview.generatedLength.toFixed(0)} Karteneinheiten. Beide Länder verwenden exakt dieselben Kurvenpunkte.</div> : null}
        <button type="button" className={`button primary ${styles.primaryAction}`} disabled={!preview || saving} onClick={() => void savePreview()}>{saving ? "Grenze wird gespeichert …" : "Gemeinsame Grenze speichern"}</button>
        <small className={styles.panelText}>Die Endpunkte bleiben fest. Beim Speichern werden beide Länder atomar aktualisiert; der Überschneidungsschutz prüft die neue Form gegen weitere Länder.</small>
      </div> : <div className={styles.fieldStack}>
        <label className={styles.field}>Name<input value={newName} disabled={saving || drawingCountry} onChange={(event) => setNewName(event.target.value)} placeholder="Name des neuen Landes"/></label>
        <label className={styles.field}>Farbe<div className={styles.colorRow}><input type="color" value={newColor} disabled={saving || drawingCountry} onChange={(event) => setNewColor(event.target.value)}/><span className={styles.colorValue}>{newColor}</span></div></label>
        <div className={styles.drawHint}><strong>Automatische Anpassung aktiv.</strong><br/>Du darfst beim Zeichnen über bestehende Länder fahren. Deren Fläche wird aus dem neuen Land ausgespart. {landMaskState === "ready" ? "Die Rock-3-Landmaske begrenzt zusätzlich die Küste." : landMaskState === "loading" ? "Die Landmaske wird noch geladen …" : "Ohne Landmaske wird nur an bestehende Länder angepasst."}</div>
        <button type="button" className={`button primary ${styles.primaryAction}`} disabled={!newName.trim() || saving || drawingCountry || !politicalLayer} onClick={() => void startCountryDrawing()}>{drawingCountry ? "Gebiet zeichnen …" : countryPreview ? "Gebiet neu zeichnen" : "Gebiet grob zeichnen"}</button>
        <small className={styles.panelText}>{drawingCountry ? "Klicke grob um die gewünschte Fläche. Du musst vorhandene Grenzen nicht exakt nachzeichnen. Am Startpunkt schließen." : "Tipp: Zeichne absichtlich einige Pixel/Fläche in das Nachbarland hinein. WorldReborn übernimmt dadurch die bereits belegte Kante automatisch."}</small>
        {countryPreview ? <div className={styles.drawHint}><strong>Angepasste Vorschau bereit.</strong><br/>{removedOverlapPixels > 0 ? "Überlappende bereits belegte Fläche plus ein winziger Sicherheitsrand wurden entfernt. " : "Keine bestehende Länderfläche musste entfernt werden. "}Vor dem Speichern prüft der Server zusätzlich auf verbleibende Überschneidungen.</div> : null}
        <button type="button" className={`button primary ${styles.primaryAction}`} disabled={!countryPreview || saving || !newName.trim()} onClick={() => void saveCountry()}>{saving ? "Land wird gespeichert …" : "Angepasstes Land speichern"}</button>
        {countryPreview ? <button type="button" className="button ghost" disabled={saving} onClick={() => { previewSourceRef.current?.clear(); setCountryPreview(null); setRemovedOverlapPixels(0); }}>Vorschau verwerfen</button> : null}
      </div>}
    </aside>
    <div className={`${styles.statusDock} ${styles.glass}`}><span className={styles.statusText}>{status}</span></div>
    {error ? <div className={styles.errorToast} aria-live="assertive">{error}</div> : null}
  </div>;
}
