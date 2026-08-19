"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { autoSubdividePolygon, type AutoSubdivisionResult } from "./map-auto-subdivide";
import { ensureOpenLayers, mapColor } from "./openlayers-runtime";
import { splitPolygonByDivider } from "./map-polygon-split";
import { isMapFeatureEditorLocked } from "./map-topology";
import type { WorldMapFeature } from "./map-types";
import styles from "./map-workspace.module.css";

type Mode = "parent_to_two" | "province_to_sibling";
type Workflow = "auto" | "divider";
type TargetKind = "region" | "province" | "district";

const TARGET_LABEL: Record<TargetKind, string> = { region: "Region", province: "Provinz", district: "Bezirk" };

function targetsForParent(kind: string | null): Array<{ id: TargetKind; label: string }> {
  if (kind === "country") return [{ id: "region", label: "Regionen" }, { id: "province", label: "Provinzen" }];
  if (kind === "region") return [{ id: "province", label: "Provinzen" }, { id: "district", label: "Bezirke" }];
  if (kind === "province") return [{ id: "district", label: "Bezirke" }];
  return [];
}
function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100, l = lightness / 100, c = (1 - Math.abs(2 * l - 1)) * s, h = ((hue % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((h % 2) - 1)), m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 1) rgb = [c, x, 0]; else if (h < 2) rgb = [x, c, 0]; else if (h < 3) rgb = [0, c, x]; else if (h < 4) rgb = [0, x, c]; else if (h < 5) rgb = [x, 0, c]; else rgb = [c, 0, x];
  return `#${rgb.map((value) => Math.round((value + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}
function subdivisionColors(count: number) {
  return Array.from({ length: count }, (_, index) => hslToHex(248 + (index * 310) / Math.max(1, count), 54 + (index % 3) * 4, 52 + (index % 2) * 5));
}
function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return `rgba(124,110,230,${alpha})`;
  const value = Number.parseInt(normalized, 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

export function ProvinceDividerTool({ projectId, mapId, map, row, hasProvinceChildren, onClose }: {
  projectId: number;
  mapId: number;
  map: any;
  row: WorldMapFeature;
  hasProvinceChildren: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const mode: Mode = row.location_kind === "province" ? "province_to_sibling" : "parent_to_two";
  const targetOptions = useMemo(() => targetsForParent(row.location_kind), [row.location_kind]);
  const initialTarget = targetOptions[0]?.id ?? "province";
  const [workflow, setWorkflow] = useState<Workflow>("auto");
  const [targetKind, setTargetKind] = useState<TargetKind>(initialTarget);
  const [count, setCount] = useState(6);
  const [seed, setSeed] = useState(() => Math.max(1, Number(row.feature_id) % 100000 + 17));
  const [irregularity, setIrregularity] = useState(0.75);
  const [balance, setBalance] = useState(0.84);
  const [namePrefix, setNamePrefix] = useState(TARGET_LABEL[initialTarget]);
  const [preview, setPreview] = useState<AutoSubdivisionResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [leftName, setLeftName] = useState("");
  const [rightName, setRightName] = useState("");
  const [newName, setNewName] = useState("");
  const [leftColor, setLeftColor] = useState("#9a8be8");
  const [rightColor, setRightColor] = useState("#7c6ee6");
  const [newColor, setNewColor] = useState("#9a8be8");
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const drawRef = useRef<any>(null), layerRef = useRef<any>(null), sourceRef = useRef<any>(null), disabledModifyRef = useRef<any[]>([]);
  const previewLayerRef = useRef<any>(null), previewSourceRef = useRef<any>(null);
  const locked = isMapFeatureEditorLocked(row);
  const currentColor = mapColor(row.style?.fill, "#9a8be8");
  const dividerSupported = row.entity_type === "location" && Boolean(row.entity_id) && ["country", "region", "province"].includes(row.location_kind ?? "") && ["Polygon", "MultiPolygon"].includes(row.geometry.type);
  const autoSupported = dividerSupported && targetOptions.length > 0;
  const canDraw = useMemo(() => dividerSupported && !locked && !(mode === "parent_to_two" && hasProvinceChildren) && (mode === "province_to_sibling" ? newName.trim().length > 0 : leftName.trim().length > 0 && rightName.trim().length > 0 && leftName.trim().toLocaleLowerCase() !== rightName.trim().toLocaleLowerCase()), [dividerSupported, locked, mode, hasProvinceChildren, newName, leftName, rightName]);
  const colors = useMemo(() => subdivisionColors(count), [count]);

  function cleanupInteraction() {
    if (drawRef.current && map) map.removeInteraction(drawRef.current);
    drawRef.current = null;
    for (const interaction of disabledModifyRef.current) interaction.setActive(true);
    disabledModifyRef.current = [];
  }
  function clearPreview() {
    previewSourceRef.current?.clear();
    setPreview(null);
  }
  function invalidatePreview() { clearPreview(); setError(""); }
  function applyOrganicPreset(value: number) { setIrregularity(value); invalidatePreview(); }

  useEffect(() => {
    return () => {
      if (drawRef.current && map) map.removeInteraction(drawRef.current);
      drawRef.current = null;
      for (const interaction of disabledModifyRef.current) interaction.setActive(true);
      disabledModifyRef.current = [];
      if (layerRef.current && map) map.removeLayer(layerRef.current);
      if (previewLayerRef.current && map) map.removeLayer(previewLayerRef.current);
      layerRef.current = null; sourceRef.current = null; previewLayerRef.current = null; previewSourceRef.current = null;
    };
  }, [map]);

  async function ensureSketchLayer(ol: any) {
    if (sourceRef.current && layerRef.current) return sourceRef.current;
    const source = new ol.source.Vector();
    const layer = new ol.layer.Vector({
      source,
      zIndex: 120000,
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color: "#f0ce7d", width: 3, lineDash: [9, 6] }),
        image: new ol.style.Circle({ radius: 5, fill: new ol.style.Fill({ color: "#f0ce7d" }), stroke: new ol.style.Stroke({ color: "#17130b", width: 2 }) }),
      }),
    });
    map.addLayer(layer); sourceRef.current = source; layerRef.current = layer; return source;
  }

  async function showAutoPreview(result: AutoSubdivisionResult) {
    const ol = await ensureOpenLayers();
    if (!previewSourceRef.current || !previewLayerRef.current) {
      const source = new ol.source.Vector();
      const layer = new ol.layer.Vector({
        source,
        zIndex: 119000,
        style: (feature: any) => {
          const color = String(feature.get("previewColor") ?? "#7c6ee6");
          return new ol.style.Style({ fill: new ol.style.Fill({ color: withAlpha(color, 0.28) }), stroke: new ol.style.Stroke({ color, width: 2.2 }) });
        },
      });
      map.addLayer(layer); previewSourceRef.current = source; previewLayerRef.current = layer;
    }
    const source = previewSourceRef.current; source.clear();
    const format = new ol.format.GeoJSON();
    result.parts.forEach((geometry, index) => {
      const feature = new ol.Feature({ geometry: format.readGeometry(geometry), previewColor: subdivisionColors(result.parts.length)[index], label: `${namePrefix.trim() || TARGET_LABEL[targetKind]} ${index + 1}` });
      source.addFeature(feature);
    });
  }

  async function generateAutoPreview(nextSeed = seed) {
    if (!autoSupported || locked || saving) return;
    setPreviewing(true); setError("");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const result = autoSubdividePolygon(row.geometry, { count, seed: nextSeed, irregularity, balance, maxSide: 520 });
      if (!result || result.parts.length !== count) throw new Error("Für diese Form konnte keine stabile Aufteilung erzeugt werden. Verringere die Anzahl oder probiere eine andere Verteilung.");
      setSeed(nextSeed); setPreview(result); await showAutoPreview(result);
    } catch (cause) {
      clearPreview(); setError(cause instanceof Error ? cause.message : "Vorschau konnte nicht erzeugt werden.");
    } finally { setPreviewing(false); }
  }

  async function saveAutoSubdivision() {
    if (!preview || saving || locked) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapId}/features/${row.feature_id}/subdivide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetKind, count, seed, irregularity, balance, namePrefix: namePrefix.trim() || TARGET_LABEL[targetKind], colors }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body.ok !== true) throw new Error(body.error || "Automatische Unterteilung konnte nicht gespeichert werden.");
      onClose(); router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Automatische Unterteilung konnte nicht gespeichert werden."); setSaving(false);
    }
  }

  async function startDrawing() {
    if (!map || !canDraw || drawing || saving) return;
    clearPreview(); setError(""); setDrawing(true);
    const ol = await ensureOpenLayers();
    const source = await ensureSketchLayer(ol); source.clear();
    disabledModifyRef.current = [];
    map.getInteractions().forEach((interaction: any) => {
      if (interaction instanceof ol.interaction.Modify && interaction.getActive()) { interaction.setActive(false); disabledModifyRef.current.push(interaction); }
    });
    const draw = new ol.interaction.Draw({ source, type: "LineString", stopClick: true, snapTolerance: 18 });
    drawRef.current = draw; map.addInteraction(draw);
    draw.on("drawend", async (event: any) => {
      cleanupInteraction(); setDrawing(false); setSaving(true); setError("");
      try {
        const divider = new ol.format.GeoJSON().writeGeometryObject(event.feature.getGeometry());
        const split = splitPolygonByDivider(row.geometry, divider, 1200);
        if (!split) throw new Error("Die Trennlinie teilt die Fläche nicht sauber. Starte und ende auf der Außengrenze und lasse auf beiden Seiten genügend Fläche.");
        let parts: Array<{ name: string; geometry: unknown; color: string }>;
        if (mode === "parent_to_two") {
          parts = [
            { name: rightName.trim(), geometry: split.parts[0], color: rightColor },
            { name: leftName.trim(), geometry: split.parts[1], color: leftColor },
          ];
        } else {
          const keepIndex = split.pixelAreas[0] >= split.pixelAreas[1] ? 0 : 1, siblingIndex = keepIndex === 0 ? 1 : 0;
          parts = [
            { name: row.label, geometry: split.parts[keepIndex], color: currentColor },
            { name: newName.trim(), geometry: split.parts[siblingIndex], color: newColor },
          ];
        }
        const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapId}/features/${row.feature_id}/split-province`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, parts }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.ok !== true) throw new Error(body.error || "Provinzen konnten nicht gespeichert werden.");
        onClose(); router.refresh();
      } catch (cause) {
        source.removeFeature(event.feature); setError(cause instanceof Error ? cause.message : "Provinzen konnten nicht geteilt werden."); setSaving(false);
      }
    });
  }

  function switchWorkflow(next: Workflow) {
    if (saving) return;
    cleanupInteraction(); setDrawing(false); clearPreview(); setError(""); setWorkflow(next);
  }
  function changeTarget(next: TargetKind) {
    setTargetKind(next); setNamePrefix(TARGET_LABEL[next]); invalidatePreview();
  }
  function randomize() {
    const next = Math.max(1, (seed * 1664525 + 1013904223) % 2_147_483_647);
    void generateAutoPreview(next);
  }

  const smallest = preview ? Math.min(...preview.shares) * 100 : 0;
  const largest = preview ? Math.max(...preview.shares) * 100 : 0;
  const organicityLabel = irregularity >= 0.975 ? "Extrem" : irregularity >= 0.8 ? "Wild" : irregularity >= 0.45 ? "Natürlich" : "Geordnet";

  return <aside className={`${styles.createPanel} ${styles.glass}`} style={{ width: 370 }}>
    <div className={styles.panelHeader}>
      <div><span className={styles.kicker}>GEBIET UNTERTEILEN</span><h3 className={styles.panelTitle}>{row.label}</h3><p className={styles.panelText}>Erzeuge Untergebiete automatisch oder zeichne eine einzelne politische Trennlinie.</p></div>
      <button type="button" className={styles.closeButton} disabled={saving} onClick={onClose} aria-label="Unterteilungswerkzeug schließen">×</button>
    </div>

    <div className="row" style={{ gap: 6, marginBottom: 12 }}>
      <button type="button" className={`button ${workflow === "auto" ? "primary" : "ghost"}`} disabled={saving} onClick={() => switchWorkflow("auto")}>▦ Automatisch</button>
      <button type="button" className={`button ${workflow === "divider" ? "primary" : "ghost"}`} disabled={saving} onClick={() => switchWorkflow("divider")}>✂ Trennlinie</button>
    </div>

    {locked ? <div className={styles.drawHint}>Diese Fläche ist gesperrt. Entsperre sie zuerst im Inspector.</div> : null}

    {workflow === "auto" ? <div className={styles.fieldStack}>
      {!autoSupported ? <div className={styles.drawHint}>Diese Fläche unterstützt keine automatische hierarchische Unterteilung.</div> : <>
        <label className={styles.field}>Unterteilen in<select value={targetKind} disabled={saving} onChange={(event) => changeTarget(event.target.value as TargetKind)}>{targetOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label className={styles.field}>Anzahl<div className="row" style={{ gap: 8 }}><input type="range" min="2" max="24" step="1" value={count} disabled={saving} onChange={(event) => { setCount(Number(event.target.value)); invalidatePreview(); }}/><input type="number" min="2" max="24" value={count} disabled={saving} style={{ width: 72 }} onChange={(event) => { setCount(Math.max(2, Math.min(24, Number(event.target.value) || 2))); invalidatePreview(); }}/></div></label>
        <label className={styles.field}>Namenspräfix<input value={namePrefix} disabled={saving} maxLength={160} onChange={(event) => setNamePrefix(event.target.value)} placeholder={TARGET_LABEL[targetKind]}/></label>
        <label className={styles.field}>Gleichmäßigkeit <span className={styles.colorValue}>{Math.round(balance * 100)}%</span><input type="range" min="0" max="1" step="0.05" value={balance} disabled={saving} onChange={(event) => { setBalance(Number(event.target.value)); invalidatePreview(); }}/></label>
        <label className={styles.field}>Grenzorganik <span className={styles.colorValue}>{organicityLabel} · {Math.round(irregularity * 100)}%</span><input type="range" min="0" max="1" step="0.025" value={irregularity} disabled={saving} onChange={(event) => { setIrregularity(Number(event.target.value)); invalidatePreview(); }}/></label>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="button ghost" disabled={saving} onClick={() => applyOrganicPreset(0.2)}>Geordnet</button>
          <button type="button" className="button ghost" disabled={saving} onClick={() => applyOrganicPreset(0.62)}>Natürlich</button>
          <button type="button" className="button ghost" disabled={saving} onClick={() => applyOrganicPreset(0.86)}>Wild</button>
          <button type="button" className="button ghost" disabled={saving} onClick={() => applyOrganicPreset(1)}>Extrem</button>
        </div>
        <small className={styles.panelText}>Ab hoher Grenzorganik werden die Innenkanten zusätzlich lokal verschoben. „Wild“ erzeugt deutlich geschwungene Grenzen; „Extrem“ fügt kleinere Buchten, Vorsprünge und ungleichmäßige Abschnitte hinzu, ohne Lücken zwischen den Teilgebieten zu erzeugen.</small>
        <label className={styles.field}>Seed<input type="number" min="1" max="2147483647" value={seed} disabled={saving} onChange={(event) => { setSeed(Math.max(1, Number(event.target.value) || 1)); invalidatePreview(); }}/></label>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button type="button" className="button primary" disabled={previewing || saving || locked} onClick={() => void generateAutoPreview()}>{previewing ? "Berechnet …" : preview ? "Vorschau neu berechnen" : "Vorschau erzeugen"}</button>
          <button type="button" className="button ghost" disabled={previewing || saving || locked} onClick={randomize}>↻ Andere Verteilung</button>
        </div>
        {preview ? <div className={styles.drawHint}><strong>{preview.parts.length} Teilgebiete bereit.</strong><br/>Flächenanteile ca. {smallest.toFixed(1)}–{largest.toFixed(1)} %. Seed {preview.seed}. Grenzorganik: {organicityLabel}. Die farbige Vorschau wird noch nicht gespeichert.</div> : <div className={styles.drawHint}>Die Parent-Fläche wird vollständig und ohne absichtliche Lücken aufgeteilt. Inseln können als MultiPolygon einem Teilgebiet zugeordnet werden.</div>}
        <button type="button" className={`button primary ${styles.primaryAction}`} disabled={!preview || saving || locked || !namePrefix.trim()} onClick={() => void saveAutoSubdivision()}>{saving ? `${count} Teilgebiete werden gespeichert …` : `${count} ${targetOptions.find((option) => option.id === targetKind)?.label ?? "Teilgebiete"} speichern`}</button>
        <small className={styles.panelText}>Bereits gezeichnete polygonale Untergebiete blockieren die Automatik. Vorhandene direkt zugeordnete Städte/Punkte werden beim Speichern automatisch dem räumlich passenden neuen Teilgebiet zugeordnet.</small>
      </>}
    </div> : <div className={styles.fieldStack}>
      {mode === "parent_to_two" && hasProvinceChildren ? <div className={styles.drawHint}>Dieses Gebiet besitzt bereits Provinzen. Wähle eine vorhandene Provinz und teile diese weiter, damit keine Flächen überlappen.</div> : null}
      {mode === "province_to_sibling" ? <>
        <label className={styles.field}>Neue Provinz<input value={newName} disabled={saving} onChange={(event) => setNewName(event.target.value)} placeholder="Name der neuen Provinz"/></label>
        <label className={styles.field}>Farbe<div className={styles.colorRow}><input type="color" value={newColor} disabled={saving} onChange={(event) => setNewColor(event.target.value)}/><span className={styles.colorValue}>{newColor}</span></div></label>
      </> : <>
        <label className={styles.field}>Links der Zeichenrichtung<input value={leftName} disabled={saving} onChange={(event) => setLeftName(event.target.value)} placeholder="Name der linken Provinz"/></label>
        <label className={styles.field}>Farbe links<div className={styles.colorRow}><input type="color" value={leftColor} disabled={saving} onChange={(event) => setLeftColor(event.target.value)}/><span className={styles.colorValue}>{leftColor}</span></div></label>
        <label className={styles.field}>Rechts der Zeichenrichtung<input value={rightName} disabled={saving} onChange={(event) => setRightName(event.target.value)} placeholder="Name der rechten Provinz"/></label>
        <label className={styles.field}>Farbe rechts<div className={styles.colorRow}><input type="color" value={rightColor} disabled={saving} onChange={(event) => setRightColor(event.target.value)}/><span className={styles.colorValue}>{rightColor}</span></div></label>
      </>}
      <button type="button" className={`button primary ${styles.primaryAction}`} disabled={!canDraw || drawing || saving} onClick={() => void startDrawing()}>{saving ? "Provinzen werden gespeichert …" : drawing ? "Trennlinie zeichnen …" : "Trennlinie zeichnen"}</button>
      <div className={styles.drawHint}>{drawing ? "Klicke entlang der gewünschten inneren Grenze. Doppelklick beendet die Linie." : "Start und Ende müssen auf oder sehr nah an der Außengrenze liegen. Snapping hilft beim Treffen der vorhandenen Grenze."}</div>
    </div>}

    {error ? <div className={styles.errorToast} style={{ position: "static", transform: "none", maxWidth: "none", marginTop: 10 }}>{error}</div> : null}
  </aside>;
}