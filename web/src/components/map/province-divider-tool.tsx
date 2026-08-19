"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ensureOpenLayers, mapColor } from "./openlayers-runtime";
import { splitPolygonByDivider } from "./map-polygon-split";
import { isMapFeatureEditorLocked } from "./map-topology";
import type { WorldMapFeature } from "./map-types";
import styles from "./map-workspace.module.css";

type Mode = "parent_to_two" | "province_to_sibling";

export function ProvinceDividerTool({ projectId, mapId, map, row, hasProvinceChildren, onClose }: {
  projectId: number;
  mapId: number;
  map: any;
  row: WorldMapFeature;
  hasProvinceChildren: boolean;
  onClose: () => void;
}) {
  const mode: Mode = row.location_kind === "province" ? "province_to_sibling" : "parent_to_two";
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
  const locked = isMapFeatureEditorLocked(row);
  const currentColor = mapColor(row.style?.fill, "#9a8be8");
  const supported = row.entity_type === "location" && Boolean(row.entity_id) && ["country", "region", "province"].includes(row.location_kind ?? "") && ["Polygon", "MultiPolygon"].includes(row.geometry.type);
  const canDraw = useMemo(() => supported && !locked && !(mode === "parent_to_two" && hasProvinceChildren) && (mode === "province_to_sibling" ? newName.trim().length > 0 : leftName.trim().length > 0 && rightName.trim().length > 0 && leftName.trim().toLocaleLowerCase() !== rightName.trim().toLocaleLowerCase()), [supported, locked, mode, hasProvinceChildren, newName, leftName, rightName]);

  function cleanupInteraction() {
    if (drawRef.current && map) map.removeInteraction(drawRef.current);
    drawRef.current = null;
    for (const interaction of disabledModifyRef.current) interaction.setActive(true);
    disabledModifyRef.current = [];
  }

  useEffect(() => {
    return () => {
      if (drawRef.current && map) map.removeInteraction(drawRef.current);
      drawRef.current = null;
      for (const interaction of disabledModifyRef.current) interaction.setActive(true);
      disabledModifyRef.current = [];
      if (layerRef.current && map) map.removeLayer(layerRef.current);
      layerRef.current = null;
      sourceRef.current = null;
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
    map.addLayer(layer);
    sourceRef.current = source;
    layerRef.current = layer;
    return source;
  }

  async function startDrawing() {
    if (!map || !canDraw || drawing || saving) return;
    setError("");
    setDrawing(true);
    const ol = await ensureOpenLayers();
    const source = await ensureSketchLayer(ol);
    source.clear();
    disabledModifyRef.current = [];
    map.getInteractions().forEach((interaction: any) => {
      if (interaction instanceof ol.interaction.Modify && interaction.getActive()) {
        interaction.setActive(false);
        disabledModifyRef.current.push(interaction);
      }
    });
    const draw = new ol.interaction.Draw({ source, type: "LineString", stopClick: true, snapTolerance: 18 });
    drawRef.current = draw;
    map.addInteraction(draw);
    draw.on("drawend", async (event: any) => {
      cleanupInteraction();
      setDrawing(false);
      setSaving(true);
      setError("");
      try {
        const divider = new ol.format.GeoJSON().writeGeometryObject(event.feature.getGeometry());
        const split = splitPolygonByDivider(row.geometry, divider, 1200);
        if (!split) throw new Error("Die Trennlinie teilt die Fläche nicht sauber. Starte und ende auf der Außengrenze und lasse auf beiden Seiten genügend Fläche.");

        let parts: Array<{ name: string; geometry: unknown; color: string }>;
        if (mode === "parent_to_two") {
          // The local raster grid flips Y, therefore part 1 is visually left and part 0 right of the drawn direction.
          parts = [
            { name: rightName.trim(), geometry: split.parts[0], color: rightColor },
            { name: leftName.trim(), geometry: split.parts[1], color: leftColor },
          ];
        } else {
          const keepIndex = split.pixelAreas[0] >= split.pixelAreas[1] ? 0 : 1;
          const siblingIndex = keepIndex === 0 ? 1 : 0;
          parts = [
            { name: row.label, geometry: split.parts[keepIndex], color: currentColor },
            { name: newName.trim(), geometry: split.parts[siblingIndex], color: newColor },
          ];
        }

        const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapId}/features/${row.feature_id}/split-province`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, parts }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body.ok !== true) throw new Error(body.error || "Provinzen konnten nicht gespeichert werden.");
        window.setTimeout(() => window.location.reload(), 220);
      } catch (cause) {
        source.removeFeature(event.feature);
        setError(cause instanceof Error ? cause.message : "Provinzen konnten nicht geteilt werden.");
        setSaving(false);
      }
    });
  }

  return <aside className={`${styles.createPanel} ${styles.glass}`} style={{ width: 350 }}>
    <div className={styles.panelHeader}>
      <div><span className={styles.kicker}>PROVINZEN TEILEN</span><h3 className={styles.panelTitle}>{row.label}</h3><p className={styles.panelText}>{mode === "province_to_sibling" ? "Zeichne nur die neue innere Grenze. Die größere Seite behält den bestehenden Provinznamen; die kleinere Seite wird die neue Provinz." : "Zeichne nur eine Trennlinie durch das Gebiet. Die Außenkante wird vollständig vom Land bzw. der Region übernommen."}</p></div>
      <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Teilungswerkzeug schließen">×</button>
    </div>
    <div className={styles.fieldStack}>
      {locked ? <div className={styles.drawHint}>Diese Fläche ist gesperrt. Entsperre sie zuerst im Inspector.</div> : null}
      {mode === "parent_to_two" && hasProvinceChildren ? <div className={styles.drawHint}>Dieses Gebiet besitzt bereits Provinzen. Wähle eine vorhandene Provinz und teile diese weiter, damit keine Flächen überlappen.</div> : null}
      {mode === "province_to_sibling" ? <>
        <label className={styles.field}>Neue Provinz<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Name der neuen Provinz"/></label>
        <label className={styles.field}>Farbe<div className={styles.colorRow}><input type="color" value={newColor} onChange={(event) => setNewColor(event.target.value)}/><span className={styles.colorValue}>{newColor}</span></div></label>
      </> : <>
        <label className={styles.field}>Links der Zeichenrichtung<input value={leftName} onChange={(event) => setLeftName(event.target.value)} placeholder="Name der linken Provinz"/></label>
        <label className={styles.field}>Farbe links<div className={styles.colorRow}><input type="color" value={leftColor} onChange={(event) => setLeftColor(event.target.value)}/><span className={styles.colorValue}>{leftColor}</span></div></label>
        <label className={styles.field}>Rechts der Zeichenrichtung<input value={rightName} onChange={(event) => setRightName(event.target.value)} placeholder="Name der rechten Provinz"/></label>
        <label className={styles.field}>Farbe rechts<div className={styles.colorRow}><input type="color" value={rightColor} onChange={(event) => setRightColor(event.target.value)}/><span className={styles.colorValue}>{rightColor}</span></div></label>
      </>}
      <button type="button" className={`button primary ${styles.primaryAction}`} disabled={!canDraw || drawing || saving} onClick={() => void startDrawing()}>{saving ? "Provinzen werden gespeichert …" : drawing ? "Trennlinie zeichnen …" : "Trennlinie zeichnen"}</button>
      <div className={styles.drawHint}>{drawing ? "Klicke entlang der gewünschten inneren Grenze. Doppelklick beendet die Linie." : "Start und Ende müssen auf oder sehr nah an der Außengrenze liegen. Snapping hilft beim Treffen der vorhandenen Grenze."}</div>
      {error ? <div className={styles.errorToast} style={{ position: "static", transform: "none", maxWidth: "none" }}>{error}</div> : null}
    </div>
  </aside>;
}
