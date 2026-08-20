"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ensureOpenLayers, mediaMapUrl, parseMapBounds } from "@/components/map/openlayers-runtime";

type OriginMap = {
  mapId: number;
  name: string;
  mapType: "image" | "tile";
  tileUrl: string | null;
  imagePath: string | null;
  minZoom: number;
  maxZoom: number;
  centerLat: number | null;
  centerLng: number | null;
  bounds: unknown;
};

type InitialOrigin = {
  mapId?: number | null;
  coordinateMode?: "xy" | "latlng" | null;
  x?: number | null;
  y?: number | null;
  lat?: number | null;
  lng?: number | null;
};

export function RaceOriginPicker({ maps, initial }: { maps: OriginMap[]; initial?: InitialOrigin }) {
  const firstMapId = initial?.mapId && maps.some((map) => map.mapId === initial.mapId) ? initial.mapId : null;
  const [mapId, setMapId] = useState<number | null>(firstMapId);
  const [mode, setMode] = useState<"xy" | "latlng" | null>(initial?.coordinateMode ?? null);
  const [x, setX] = useState<number | null>(initial?.x ?? null);
  const [y, setY] = useState<number | null>(initial?.y ?? null);
  const [lat, setLat] = useState<number | null>(initial?.lat ?? null);
  const [lng, setLng] = useState<number | null>(initial?.lng ?? null);
  const targetRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const selectedMap = useMemo(() => maps.find((map) => map.mapId === mapId) ?? null, [maps, mapId]);

  function clearPoint(keepMap = true) {
    setMode(null); setX(null); setY(null); setLat(null); setLng(null);
    if (!keepMap) setMapId(null);
  }

  useEffect(() => {
    let active = true;
    if (!selectedMap || !targetRef.current) {
      mapRef.current?.setTarget(undefined); mapRef.current = null;
      return;
    }
    void ensureOpenLayers().then((ol) => {
      if (!active || !targetRef.current) return;
      const layers: any[] = [];
      let view: any;
      let projection: any;
      let imageExtent: number[] | null = null;
      if (selectedMap.mapType === "image") {
        const bounds = parseMapBounds(selectedMap.bounds) ?? [[0, 0], [4096, 8192]];
        imageExtent = [bounds[0][1], bounds[0][0], bounds[1][1], bounds[1][0]];
        projection = new ol.proj.Projection({ code: `WORLDREBORN:RACE-ORIGIN:${selectedMap.mapId}`, units: "pixels", extent: imageExtent });
        const url = selectedMap.imagePath ? mediaMapUrl(selectedMap.imagePath) : null;
        if (url) layers.push(new ol.layer.Image({ source: new ol.source.ImageStatic({ url, projection, imageExtent }) }));
        view = new ol.View({ projection, center: ol.extent.getCenter(imageExtent), zoom: 0, minZoom: selectedMap.minZoom, maxZoom: selectedMap.maxZoom, extent: imageExtent });
      } else {
        if (selectedMap.tileUrl) layers.push(new ol.layer.Tile({ source: new ol.source.XYZ({ url: selectedMap.tileUrl, wrapX: false }) }));
        view = new ol.View({ center: ol.proj.fromLonLat([selectedMap.centerLng ?? 0, selectedMap.centerLat ?? 0]), zoom: Math.max(selectedMap.minZoom, 2), minZoom: selectedMap.minZoom, maxZoom: selectedMap.maxZoom });
      }

      const markerSource = new ol.source.Vector();
      const markerLayer = new ol.layer.Vector({ source: markerSource, zIndex: 1000, style: new ol.style.Style({ image: new ol.style.Circle({ radius: 8, fill: new ol.style.Fill({ color: "rgba(235,196,104,.9)" }), stroke: new ol.style.Stroke({ color: "#17130b", width: 3 }) }) }) });
      layers.push(markerLayer);
      const map = new ol.Map({ target: targetRef.current, layers, view });
      mapRef.current = map;
      if (imageExtent) view.fit(imageExtent, { padding: [18, 18, 18, 18] });

      const placeMarker = (coordinate: number[]) => {
        markerSource.clear();
        markerSource.addFeature(new ol.Feature({ geometry: new ol.geom.Point(coordinate) }));
      };
      if (selectedMap.mapType === "image" && mode === "xy" && x != null && y != null) placeMarker([x, y]);
      if (selectedMap.mapType === "tile" && mode === "latlng" && lat != null && lng != null) placeMarker(ol.proj.fromLonLat([lng, lat]));

      map.on("singleclick", (event: any) => {
        if (selectedMap.mapType === "image") {
          const nextX = Number(event.coordinate[0].toFixed(2));
          const nextY = Number(event.coordinate[1].toFixed(2));
          setMode("xy"); setX(nextX); setY(nextY); setLat(null); setLng(null); placeMarker([nextX, nextY]);
        } else {
          const coordinate = ol.proj.toLonLat(event.coordinate);
          const nextLng = Number(coordinate[0].toFixed(6));
          const nextLat = Number(coordinate[1].toFixed(6));
          setMode("latlng"); setLat(nextLat); setLng(nextLng); setX(null); setY(null); placeMarker(event.coordinate);
        }
      });
    });
    return () => { active = false; mapRef.current?.setTarget(undefined); mapRef.current = null; };
    // Coordinates are intentionally not dependencies: clicking moves only the marker in the live map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMap]);

  return <fieldset className="image-source-fieldset">
    <legend>Ungefährer Ursprung auf der Karte</legend>
    <div className="field-grid two">
      <label>Karte<select value={mapId ?? ""} onChange={(event) => { const next = Number(event.target.value); clearPoint(true); setMapId(Number.isSafeInteger(next) && next > 0 ? next : null); }}><option value="">Kein Ursprung gesetzt</option>{maps.map((map) => <option key={map.mapId} value={map.mapId}>{map.name}</option>)}</select></label>
      <div><span className="section-help">{selectedMap ? selectedMap.mapType === "image" ? "Klicke auf die Weltkarte, um X/Y zu setzen." : "Klicke auf die Karte, um Breiten-/Längengrad zu setzen." : "Optional: Wähle eine Karte und klicke ungefähr auf das Ursprungsgebiet."}</span></div>
    </div>
    {selectedMap ? <>
      <div ref={targetRef} style={{ width: "100%", height: 360, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,.12)", background: "#10151d" }}/>
      <div className="row wrap-row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <small className="muted">{mode === "xy" && x != null && y != null ? `X ${x} · Y ${y}` : mode === "latlng" && lat != null && lng != null ? `${lat.toFixed(5)}°, ${lng.toFixed(5)}°` : "Noch kein Ursprungspunkt gesetzt."}</small>
        {mode ? <button type="button" className="button ghost" onClick={() => clearPoint(true)}>Punkt entfernen</button> : null}
      </div>
    </> : null}
    <input type="hidden" name="originMapId" value={mapId ?? ""}/>
    <input type="hidden" name="originCoordinateMode" value={mode ?? ""}/>
    <input type="hidden" name="originX" value={x ?? ""}/>
    <input type="hidden" name="originY" value={y ?? ""}/>
    <input type="hidden" name="originLat" value={lat ?? ""}/>
    <input type="hidden" name="originLng" value={lng ?? ""}/>
  </fieldset>;
}
