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

type Marker = {
  marker_id: string | number;
  marker_type: string;
  entity_type?: string | null;
  entity_id?: string | number | null;
  coordinate_mode: string;
  lat: number | null;
  lng: number | null;
  x: number | null;
  y: number | null;
  icon?: string | null;
  label: string;
  short_description?: string | null;
  visibility_mode?: string;
  layer: string;
  z_index: number;
};

type LeafletPoint = { lat: number; lng: number };
type LeafletMarker = { bindPopup(content: HTMLElement | string): LeafletMarker; on(event: string, handler: () => void): LeafletMarker; getLatLng(): LeafletPoint; remove(): void };
type LeafletMap = { setView(center: [number, number], zoom: number): LeafletMap; fitBounds(bounds: [[number, number], [number, number]]): LeafletMap; on(event: string, handler: (event: { latlng: LeafletPoint }) => void): LeafletMap; remove(): void };
type LeafletApi = {
  CRS: { Simple: unknown };
  map(element: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options?: Record<string, unknown>): { addTo(map: LeafletMap): unknown };
  imageOverlay(url: string, bounds: [[number, number], [number, number]]): { addTo(map: LeafletMap): unknown };
  marker(position: [number, number], options?: Record<string, unknown>): LeafletMarker & { addTo(map: LeafletMap): LeafletMarker };
};

declare global { interface Window { L?: LeafletApi } }

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

function ensureLeaflet(): Promise<LeafletApi> {
  if (window.L) return Promise.resolve(window.L);
  if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = LEAFLET_CSS; document.head.appendChild(link);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LEAFLET_JS}"]`);
    const script = existing ?? document.createElement("script");
    const done = () => window.L ? resolve(window.L) : reject(new Error("Leaflet failed to load."));
    script.addEventListener("load", done, { once: true }); script.addEventListener("error", () => reject(new Error("Leaflet failed to load.")), { once: true });
    if (!existing) { script.src = LEAFLET_JS; script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo="; script.crossOrigin = ""; document.head.appendChild(script); }
  });
}

function parseBounds(value: unknown): [[number, number], [number, number]] | null {
  if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[0]) || !Array.isArray(value[1])) return null;
  const a = value[0].map(Number); const b = value[1].map(Number);
  return a.length >= 2 && b.length >= 2 && a.every(Number.isFinite) && b.every(Number.isFinite) ? [[a[0], a[1]], [b[0], b[1]]] : null;
}

export function MapViewer({ mapConfig, initialMarkers, admin = false, projectId }: { mapConfig: MapConfig; initialMarkers: Marker[]; admin?: boolean; projectId?: number }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [markers, setMarkers] = useState(initialMarkers);
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(() => new Set(initialMarkers.map((marker) => marker.layer)));
  const [error, setError] = useState<string | null>(null);
  const layers = useMemo(() => [...new Set(markers.map((marker) => marker.layer))].sort(), [markers]);

  useEffect(() => {
    let active = true; let leafletMap: LeafletMap | null = null;
    ensureLeaflet().then((L) => {
      if (!active || !elementRef.current) return;
      const simple = mapConfig.mapType === "image";
      leafletMap = L.map(elementRef.current, simple ? { crs: L.CRS.Simple, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom } : { minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom });
      if (simple && mapConfig.imagePath) {
        const bounds = parseBounds(mapConfig.bounds) ?? [[0, 0], [1000, 1000]];
        L.imageOverlay(mapConfig.imagePath.startsWith("/") ? mapConfig.imagePath : `/api/media/${mapConfig.imagePath}`, bounds).addTo(leafletMap);
        leafletMap.fitBounds(bounds);
      } else if (mapConfig.tileUrl) {
        L.tileLayer(mapConfig.tileUrl, { minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom, noWrap: Boolean(mapConfig.config.no_wrap ?? mapConfig.config.noWrap ?? true) }).addTo(leafletMap);
        leafletMap.setView([mapConfig.centerLat ?? 0, mapConfig.centerLng ?? 0], Math.max(mapConfig.minZoom, 3));
      }

      for (const marker of markers) {
        if (!visibleLayers.has(marker.layer)) continue;
        const position: [number, number] | null = marker.coordinate_mode === "xy" && marker.x != null && marker.y != null ? [marker.y, marker.x] : marker.lat != null && marker.lng != null ? [marker.lat, marker.lng] : null;
        if (!position) continue;
        const instance = L.marker(position, { draggable: admin, zIndexOffset: marker.z_index }).addTo(leafletMap);
        const popup = document.createElement("div");
        const title = document.createElement("strong"); title.textContent = marker.label; popup.append(title);
        if (marker.short_description) { const description = document.createElement("p"); description.textContent = marker.short_description; popup.append(description); }
        const type = document.createElement("small"); type.textContent = `${marker.marker_type} · ${marker.layer}`; popup.append(type);
        if (admin && projectId) {
          const actions = document.createElement("div");
          const rename = document.createElement("button"); rename.type = "button"; rename.textContent = "Umbenennen";
          rename.onclick = async () => { const label = window.prompt("Marker-Name", marker.label)?.trim(); if (!label) return; const payload = { markerType: marker.marker_type, entityType: marker.entity_type ?? null, entityId: marker.entity_id ?? null, coordinateMode: marker.coordinate_mode, lat: marker.lat, lng: marker.lng, x: marker.x, y: marker.y, icon: marker.icon ?? null, label, shortDescription: marker.short_description ?? null, visibilityMode: marker.visibility_mode ?? "admin_only", layer: marker.layer, zIndex: marker.z_index }; const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/markers/${marker.marker_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (response.ok) setMarkers((current) => current.map((item) => String(item.marker_id) === String(marker.marker_id) ? { ...item, label } : item)); };
          const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "Löschen";
          remove.onclick = async () => { if (!window.confirm(`Marker „${marker.label}“ löschen?`)) return; const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/markers/${marker.marker_id}`, { method: "DELETE" }); if (response.ok) { instance.remove(); setMarkers((current) => current.filter((item) => String(item.marker_id) !== String(marker.marker_id))); } };
          actions.append(rename, remove); popup.append(actions);
          instance.on("dragend", async () => { const point = instance.getLatLng(); const positionPayload = marker.coordinate_mode === "xy" ? { x: point.lng, y: point.lat } : { lat: point.lat, lng: point.lng }; await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/markers/${marker.marker_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "move", position: positionPayload }) }); });
        }
        instance.bindPopup(popup);
      }

      if (admin && projectId) {
        leafletMap.on("click", async (event) => {
          const label = window.prompt("Neuer Marker – Name")?.trim(); if (!label) return;
          const payload = simple ? { markerType: "custom", coordinateMode: "xy", x: event.latlng.lng, y: event.latlng.lat, label, visibilityMode: "admin_only", layer: "custom", zIndex: 0 } : { markerType: "custom", coordinateMode: "latlng", lat: event.latlng.lat, lng: event.latlng.lng, label, visibilityMode: "admin_only", layer: "custom", zIndex: 0 };
          const response = await fetch(`/api/admin/projects/${projectId}/maps/${mapConfig.mapId}/markers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          if (response.ok) window.location.reload(); else setError("Marker konnte nicht gespeichert werden.");
        });
      }
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Karte konnte nicht geladen werden."));
    return () => { active = false; leafletMap?.remove(); };
  }, [admin, mapConfig, markers, projectId, visibleLayers]);

  const toggleLayer = (layer: string) => setVisibleLayers((current) => { const next = new Set(current); if (next.has(layer)) next.delete(layer); else next.add(layer); return next; });

  return <div className="stack"><div className="row wrap-row"><strong>Layer</strong>{layers.map((layer) => <label key={layer} className="soft-label"><input type="checkbox" checked={visibleLayers.has(layer)} onChange={() => toggleLayer(layer)}/> {layer}</label>)}</div>{error ? <p className="form-error">{error}</p> : null}<div ref={elementRef} style={{ width: "100%", minHeight: "65vh", borderRadius: 12, overflow: "hidden" }} aria-label="World map"/></div>;
}
