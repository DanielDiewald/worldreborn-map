export type OlGlobal = Record<string, any>;

const OL_JS = "https://cdn.jsdelivr.net/npm/ol@10.6.1/dist/ol.js";
const OL_CSS = "https://cdn.jsdelivr.net/npm/ol@10.6.1/ol.css";

declare global {
  interface Window {
    ol?: OlGlobal;
  }
}

function installReliablePolygonHitDetection(ol: OlGlobal) {
  const prototype = ol?.Map?.prototype as Record<string, any> | undefined;
  if (!prototype || prototype.__worldrebornReliablePolygonHitDetection) return;
  const original = prototype.forEachFeatureAtPixel;
  if (typeof original !== "function") return;

  prototype.forEachFeatureAtPixel = function patchedForEachFeatureAtPixel(
    pixel: number[],
    callback: (feature: any, layer?: any) => unknown,
    options: Record<string, any> = {},
  ) {
    const seen = new Set<any>();
    const wrappedCallback = (feature: any, layer?: any, geometry?: any) => {
      if (feature) seen.add(feature);
      return callback(feature, layer, geometry);
    };

    const directResult = original.call(this, pixel, wrappedCallback, options);
    if (directResult) return directResult;

    // Canvas hit detection can become unreliable for very detailed Polygon/MultiPolygon
    // geometries generated from raster partitions. Fall back to the vector source's
    // geometry index at the exact map coordinate. This keeps normal pixel hit detection
    // for points/lines while making complex political areas reliably selectable.
    const coordinate = this.getCoordinateFromPixel?.(pixel);
    if (!coordinate) return directResult;

    const layerFilter = typeof options.layerFilter === "function" ? options.layerFilter : () => true;
    const layers = this.getLayers?.().getArray?.() ?? [];
    for (let index = layers.length - 1; index >= 0; index -= 1) {
      const layer = layers[index];
      if (!layer?.getVisible?.() || !layerFilter(layer)) continue;
      const source = layer.getSource?.();
      if (!source || typeof source.getFeaturesAtCoordinate !== "function") continue;
      const candidates = source.getFeaturesAtCoordinate(coordinate) ?? [];
      for (const feature of candidates) {
        if (!feature || seen.has(feature)) continue;
        const type = feature.getGeometry?.()?.getType?.();
        if (type !== "Polygon" && type !== "MultiPolygon") continue;
        seen.add(feature);
        const result = callback(feature, layer);
        if (result) return result;
      }
    }
    return directResult;
  };

  prototype.__worldrebornReliablePolygonHitDetection = true;
}

function prepareOpenLayers(ol: OlGlobal) {
  installReliablePolygonHitDetection(ol);
  return ol;
}

export async function ensureOpenLayers(): Promise<OlGlobal> {
  if (window.ol) return prepareOpenLayers(window.ol);

  if (!document.querySelector(`link[href="${OL_CSS}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = OL_CSS;
    document.head.appendChild(link);
  }

  return new Promise<OlGlobal>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OL_JS}"]`);
    const script = existing ?? document.createElement("script");
    const loaded = () => window.ol ? resolve(prepareOpenLayers(window.ol)) : reject(new Error("OpenLayers konnte nicht geladen werden."));
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", () => reject(new Error("OpenLayers konnte nicht geladen werden.")), { once: true });
    if (!existing) {
      script.src = OL_JS;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }
  });
}

export function parseMapBounds(value: unknown): [[number, number], [number, number]] | null {
  if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[0]) || !Array.isArray(value[1])) return null;
  const a = value[0].map(Number);
  const b = value[1].map(Number);
  return a.length >= 2 && b.length >= 2 && a.every(Number.isFinite) && b.every(Number.isFinite)
    ? [[a[0], a[1]], [b[0], b[1]]]
    : null;
}

export function mapColor(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function colorWithAlpha(hex: string, alpha: number) {
  const clean = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return `rgba(124,110,230,${alpha})`;
  const n = Number.parseInt(clean, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function mediaMapUrl(value: string | null) {
  if (!value) return null;
  return value.startsWith("/") ? value : `/api/media/${value}`;
}
