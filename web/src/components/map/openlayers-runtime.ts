export type OlGlobal = Record<string, any>;

const OL_JS = "https://cdn.jsdelivr.net/npm/ol@10.6.1/dist/ol.js";
const OL_CSS = "https://cdn.jsdelivr.net/npm/ol@10.6.1/ol.css";

declare global {
  interface Window {
    ol?: OlGlobal;
  }
}

export async function ensureOpenLayers(): Promise<OlGlobal> {
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
