"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ensureOpenLayers, mediaMapUrl, parseMapBounds } from "./openlayers-runtime";
import {
  randomizeSharedPoliticalBorder,
  sharedBorderNeighbors,
  smoothSharedPoliticalBorder,
  type BorderShapeResult,
} from "./map-border-shaping";
import type { JsonMapGeometry, MapExtent } from "./map-geometry-guides";
import type { WorldMapConfig, WorldMapFeature } from "./map-types";
import styles from "./map-workspace.module.css";

type Mode = "smooth" | "random";

function isCountry(row: WorldMapFeature) {
  return row.location_kind === "country" && ["Polygon", "MultiPolygon"].includes(row.geometry.type);
}

function colorFor(index: number) {
  const colors = ["#d6ad63", "#7bc7a4", "#8878e5", "#e07b70", "#75aee6", "#d889d2"];
  return colors[index % colors.length];
}

export function PoliticalBorderWorkbench({ projectId, mapConfig, features, height = "100%" }: {
  projectId: number;
  mapConfig: WorldMapConfig;
  features: WorldMapFeature[];
  height?: string;
}) {
  const countries = useMemo(() => features.filter(isCountry), [features]);
  const mapExtent = useMemo<MapExtent>(() => {
    const bounds = parseMapBounds(mapConfig.bounds) ?? [[0, 0], [4096, 8192]];
    return [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]];
  }, [mapConfig.bounds]);
  const tolerance = useMemo(() => Math.max(0.6, Math.max(mapExtent[2] - mapExtent[0], mapExtent[3] - mapExtent[1]) / 4500), [mapExtent]);

  const [rows, setRows] = useState<WorldMapFeature[]>(countries.map((row) => ({ ...row })));
  const [countryAId, setCountryAId] = useState<number | null>(countries[0] ? Number(countries[0].feature_id) : null);
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
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Wähle zwei benachbarte Länder mit einer gemeinsamen gespeicherten Grenze.");
  const [error, setError] = useState("");

  const targetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const sourceRef = useRef<any>(null);
  const previewSourceRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const featureRefs = useRef(new Map<number, any>());

  useEffect(() => {
    if (!countryA) { setCountryBId(null); return; }
    if (!neighbors.length) { setCountryBId(null); return; }
    if (!neighbors.some((row) => Number(row.feature_id) === countryBId)) setCountryBId(Number(neighbors[0].feature_id));
  }, [countryAId, neighbors, countryBId, countryA]);

  useEffect(() => {
    setPreview(null);
    previewSourceRef.current?.clear();
  }, [countryAId, countryBId, mode, smoothness, roughness, detail]);

  useEffect(() => {
    let active = true;
    ensureOpenLayers().then((ol) => {
      if (!active || !targetRef.current) return;
      featureRefs.current.clear();
      const simple = mapConfig.mapType === "image";
      const projection = simple ? new ol.proj.Projection({ code: `WORLDREBORN:BORDERS:${mapConfig.mapId}`, units: "pixels", extent: mapExtent }) : undefined;
      const layers: any[] = [];
      if (simple && mapConfig.imagePath) {
        const url = mediaMapUrl(mapConfig.imagePath);
        if (url) layers.push(new ol.layer.Image({ zIndex: -1000, source: new ol.source.ImageStatic({ url, projection, imageExtent: mapExtent }) }));
      } else if (mapConfig.tileUrl) {
        layers.push(new ol.layer.Tile({ zIndex: -1000, source: new ol.source.XYZ({ url: mapConfig.tileUrl, wrapX: false }) }));
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
          const color = colorFor(index);
          return new ol.style.Style({
            fill: new ol.style.Fill({ color: selected || neighbor ? `${color}38` : "rgba(120,125,135,.10)" }),
            stroke: new ol.style.Stroke({ color: selected || neighbor ? color : "rgba(235,235,235,.45)", width: selected || neighbor ? 3 : 1.25 }),
            text: new ol.style.Text({ text: String(feature.get("label") ?? ""), fill: new ol.style.Fill({ color: "#fff" }), stroke: new ol.style.Stroke({ color: "#111", width: 3 }) }),
          });
        },
      });
      layerRef.current = vector;
      layers.push(vector);

      const previewSource = new ol.source.Vector();
      previewSourceRef.current = previewSource;
      layers.push(new ol.layer.Vector({
        source: previewSource,
        zIndex: 10000,
        style: (feature: any) => new ol.style.Style({
          fill: new ol.style.Fill({ color: feature.get("side") === "a" ? "rgba(214,173,99,.18)" : "rgba(123,199,164,.18)" }),
          stroke: new ol.style.Stroke({ color: feature.get("side") === "a" ? "#f0c873" : "#8ee0b9", width: 4 }),
        }),
      }));

      const format = new ol.format.GeoJSON();
      rows.forEach((row, index) => {
        try {
          const id = Number(row.feature_id);
          const feature = new ol.Feature({ geometry: format.readGeometry(row.geometry), featureId: id, label: row.label, index });
          source.addFeature(feature);
          featureRefs.current.set(id, feature);
        } catch { /* malformed legacy polygon stays out of the workbench */ }
      });

      const view = simple
        ? new ol.View({ projection, center: ol.extent.getCenter(mapExtent), zoom: 0, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom, extent: mapExtent })
        : new ol.View({ center: ol.proj.fromLonLat([mapConfig.centerLng ?? 0, mapConfig.centerLat ?? 0]), zoom: 3, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom });
      const map = new ol.Map({ target: targetRef.current, layers, view });
      mapRef.current = map;
      if (simple) view.fit(mapExtent, { padding: [20, 20, 20, 20] });

      map.on("singleclick", (event: any) => {
        const hit = map.forEachFeatureAtPixel(event.pixel, (feature: any) => Number(feature.get("featureId")) || null, { hitTolerance: 8, layerFilter: (candidate: any) => candidate === vector });
        if (hit) setCountryAId(Number(hit));
      });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Grenzwerkzeug konnte nicht geladen werden."));
    return () => { active = false; mapRef.current?.setTarget(undefined); mapRef.current = null; sourceRef.current = null; previewSourceRef.current = null; featureRefs.current.clear(); };
  // The map is intentionally initialized once per map. Geometry updates happen below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapConfig.mapId]);

  useEffect(() => {
    for (const row of rows) {
      const id = Number(row.feature_id);
      const feature = featureRefs.current.get(id);
      if (!feature) continue;
      feature.set("selected", id === countryAId);
      feature.set("neighbor", id === Number(countryB?.feature_id));
    }
    layerRef.current?.changed();
    if (countryA && countryB && mapRef.current) {
      const a = featureRefs.current.get(Number(countryA.feature_id));
      const b = featureRefs.current.get(Number(countryB.feature_id));
      const extentA = a?.getGeometry()?.getExtent();
      const extentB = b?.getGeometry()?.getExtent();
      if (extentA && extentB) {
        const extent = [Math.min(extentA[0], extentB[0]), Math.min(extentA[1], extentB[1]), Math.max(extentA[2], extentB[2]), Math.max(extentA[3], extentB[3])];
        mapRef.current.getView().fit(extent, { padding: [80, 80, 80, 430], maxZoom: Math.min(mapConfig.maxZoom, 4), duration: 220 });
      }
    }
  }, [rows, countryAId, countryB, countryA, mapConfig.maxZoom]);

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

  return <div className={styles.workspace} style={{ height }}>
    <div ref={targetRef} className={styles.canvas}/>
    <aside className={`${styles.createPanel} ${styles.glass}`} style={{ width: 390 }}>
      <div className={styles.panelHeader}>
        <div><span className={styles.kicker}>GRENZWERKZEUG</span><h3 className={styles.panelTitle}>Gemeinsame Grenze formen</h3><p className={styles.panelText}>Glätte bestehende Treppengrenzen oder erzeuge schnell eine neue zufällige Grenze zwischen zwei Nachbarländern.</p></div>
      </div>
      {!countries.length ? <div className={styles.drawHint}>Auf dieser Karte gibt es noch keine gezeichneten Länder.</div> : <div className={styles.fieldStack}>
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
        <small className={styles.panelText}>Die Endpunkte bleiben fest. Beim Speichern werden beide Länder atomar aktualisiert; der bestehende Überschneidungsschutz prüft die neue Form gegen weitere Länder.</small>
      </div>}
    </aside>
    <div className={`${styles.statusDock} ${styles.glass}`}><span className={styles.statusText}>{status}</span></div>
    {error ? <div className={styles.errorToast} aria-live="assertive">{error}</div> : null}
  </div>;
}
