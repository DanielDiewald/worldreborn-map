import type { WorldMapFeature } from "./map-types";

export type PoliticalPaletteMode = "parent" | "harmonious" | "contrast" | "single";

export type MapFeaturePresentation = {
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  autoStroke: boolean;
  labelVisible: boolean;
  labelColor: string;
  labelSize: number;
  labelWeight: number;
  labelHalo: string;
  labelHaloWidth: number;
  labelOpacity: number;
  labelOffsetX: number;
  labelOffsetY: number;
  labelMinZoom: number | null;
  labelMaxZoom: number | null;
};

export const POLITICAL_COLOR_PRESETS = [
  "#6678b8",
  "#8a6fa8",
  "#5f8b7b",
  "#a57963",
  "#8f6f86",
  "#607f9e",
  "#8b8b62",
  "#9b6f69",
] as const;

const FALLBACK_FILL = "#7c6ee6";
const FALLBACK_STROKE = "#f5f5f5";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeHexColor(value: unknown, fallback = FALLBACK_FILL) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    const chars = trimmed.slice(1).split("");
    return `#${chars.map((char) => `${char}${char}`).join("")}`.toLowerCase();
  }
  return fallback;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex).slice(1);
  const value = Number.parseInt(normalized, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl(hex: string) {
  const rgb = hexToRgb(hex);
  const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: saturation * 100, l: lightness * 100 };
}

export function hslToHex(hue: number, saturation: number, lightness: number) {
  const h = ((hue % 360) + 360) % 360;
  const s = clamp(saturation, 0, 100) / 100;
  const l = clamp(lightness, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgbToHex((rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255);
}

function seededUnit(seed: number, index: number) {
  let value = (Math.trunc(seed) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 4_294_967_295;
}

export function automaticBorderColor(fill: string) {
  const hsl = rgbToHsl(normalizeHexColor(fill));
  const lightness = hsl.l >= 56 ? hsl.l - 24 : hsl.l + 24;
  return hslToHex(hsl.h, clamp(hsl.s + 5, 24, 78), clamp(lightness, 22, 78));
}

export function generatePoliticalPalette(options: {
  baseColor: string;
  count: number;
  mode?: PoliticalPaletteMode;
  seed?: number;
}) {
  const count = clamp(Math.trunc(options.count), 1, 48);
  const mode = options.mode ?? "parent";
  const seed = Math.max(1, Math.trunc(options.seed ?? 1));
  const base = normalizeHexColor(options.baseColor, FALLBACK_FILL);
  const hsl = rgbToHsl(base);
  if (mode === "single") return Array.from({ length: count }, () => base);

  return Array.from({ length: count }, (_, index) => {
    const randomA = seededUnit(seed, index * 2);
    const randomB = seededUnit(seed, index * 2 + 1);
    const centered = count === 1 ? 0 : index / (count - 1) - 0.5;
    if (mode === "contrast") {
      const hue = hsl.h + index * 137.507764 + (randomA - 0.5) * 14;
      const saturation = clamp(48 + randomB * 16, 42, 70);
      const lightness = clamp(50 + ((index % 3) - 1) * 8 + (randomA - 0.5) * 5, 38, 68);
      return hslToHex(hue, saturation, lightness);
    }
    if (mode === "harmonious") {
      const hue = hsl.h + centered * 72 + (randomA - 0.5) * 12;
      const saturation = clamp(hsl.s * 0.72 + 18 + (randomB - 0.5) * 10, 38, 72);
      const lightness = clamp(49 + ((index % 4) - 1.5) * 6 + (randomA - 0.5) * 5, 38, 68);
      return hslToHex(hue, saturation, lightness);
    }
    const hue = hsl.h + centered * 18 + (randomA - 0.5) * 7;
    const saturation = clamp(hsl.s + (randomB - 0.5) * 12, 34, 78);
    const lightness = clamp(hsl.l + ((index % 5) - 2) * 5 + (randomA - 0.5) * 4, 32, 74);
    return hslToHex(hue, saturation, lightness);
  });
}

function kindDefaults(kind: string | null | undefined, geometryType = "Polygon") {
  if (kind === "country") return { strokeWidth: 3.5, labelSize: 20, minZoom: 0 };
  if (kind === "region") return { strokeWidth: 2.5, labelSize: 17, minZoom: 0.8 };
  if (kind === "province") return { strokeWidth: 1.6, labelSize: 14, minZoom: 1.6 };
  if (kind === "district") return { strokeWidth: 1.25, labelSize: 13, minZoom: 2.2 };
  if (kind === "city") return { strokeWidth: 2, labelSize: 13, minZoom: 1.3 };
  if (kind === "town") return { strokeWidth: 2, labelSize: 12, minZoom: 2 };
  if (kind === "village") return { strokeWidth: 2, labelSize: 11, minZoom: 2.8 };
  if (kind === "building" || kind === "landmark") return { strokeWidth: 2, labelSize: 11, minZoom: 3.2 };
  if (geometryType.includes("Line")) return { strokeWidth: 2.5, labelSize: 11, minZoom: 1.8 };
  return { strokeWidth: 2, labelSize: 12, minZoom: 0 };
}

export function defaultFeaturePresentationStyle(kind: string | null | undefined, fillColor = FALLBACK_FILL, geometryType = "Polygon") {
  const defaults = kindDefaults(kind, geometryType);
  const fill = normalizeHexColor(fillColor, FALLBACK_FILL);
  return {
    fill,
    fillOpacity: 0.3,
    stroke: automaticBorderColor(fill),
    strokeWidth: defaults.strokeWidth,
    autoStroke: true,
    labelVisible: true,
    labelColor: "#ffffff",
    labelSize: defaults.labelSize,
    labelWeight: kind === "country" ? 700 : 600,
    labelHalo: "#111111",
    labelHaloWidth: 3,
    labelOpacity: 1,
    labelOffsetX: 0,
    labelOffsetY: geometryType.includes("Point") ? -14 : 0,
    labelMinZoom: defaults.minZoom,
    labelMaxZoom: null,
    presentationVersion: 1,
  } as Record<string, unknown>;
}

export function resolveMapFeaturePresentation(
  row: Pick<WorldMapFeature, "style" | "location_kind" | "geometry">,
  layerStyle: Record<string, unknown> = {},
): MapFeaturePresentation {
  const style = row.style ?? {};
  const defaults = kindDefaults(row.location_kind, row.geometry.type);
  const fill = normalizeHexColor(style.fill ?? layerStyle.fill, FALLBACK_FILL);
  const autoStroke = style.autoStroke === true;
  const stroke = autoStroke
    ? automaticBorderColor(fill)
    : normalizeHexColor(style.stroke ?? layerStyle.stroke, automaticBorderColor(fill) || FALLBACK_STROKE);
  const minZoomRaw = style.labelMinZoom;
  const maxZoomRaw = style.labelMaxZoom;
  return {
    fill,
    fillOpacity: clamp(finiteNumber(style.fillOpacity, 0.3), 0, 1),
    stroke,
    strokeWidth: clamp(finiteNumber(style.strokeWidth ?? layerStyle.strokeWidth, defaults.strokeWidth), 0.5, 12),
    autoStroke,
    labelVisible: style.labelVisible !== false,
    labelColor: normalizeHexColor(style.labelColor, "#ffffff"),
    labelSize: clamp(finiteNumber(style.labelSize, defaults.labelSize), 8, 64),
    labelWeight: clamp(Math.round(finiteNumber(style.labelWeight, row.location_kind === "country" ? 700 : 600) / 100) * 100, 300, 900),
    labelHalo: normalizeHexColor(style.labelHalo, "#111111"),
    labelHaloWidth: clamp(finiteNumber(style.labelHaloWidth, 3), 0, 8),
    labelOpacity: clamp(finiteNumber(style.labelOpacity, 1), 0, 1),
    labelOffsetX: clamp(finiteNumber(style.labelOffsetX, 0), -500, 500),
    labelOffsetY: clamp(finiteNumber(style.labelOffsetY, row.geometry.type.includes("Point") ? -14 : 0), -500, 500),
    labelMinZoom: minZoomRaw === null ? null : clamp(finiteNumber(minZoomRaw, defaults.minZoom), 0, 30),
    labelMaxZoom: maxZoomRaw === null || maxZoomRaw === undefined || maxZoomRaw === "" ? null : clamp(finiteNumber(maxZoomRaw, 30), 0, 30),
  };
}

export function presentationStylePatch(value: MapFeaturePresentation) {
  return {
    fill: value.fill,
    fillOpacity: value.fillOpacity,
    stroke: value.stroke,
    strokeWidth: value.strokeWidth,
    autoStroke: value.autoStroke,
    labelVisible: value.labelVisible,
    labelColor: value.labelColor,
    labelSize: value.labelSize,
    labelWeight: value.labelWeight,
    labelHalo: value.labelHalo,
    labelHaloWidth: value.labelHaloWidth,
    labelOpacity: value.labelOpacity,
    labelOffsetX: value.labelOffsetX,
    labelOffsetY: value.labelOffsetY,
    labelMinZoom: value.labelMinZoom,
    labelMaxZoom: value.labelMaxZoom,
    presentationVersion: 1,
  };
}

export function colorWithOpacity(color: string, opacity: number) {
  const rgb = hexToRgb(normalizeHexColor(color));
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${clamp(opacity, 0, 1)})`;
}

export function labelVisibleAtZoom(presentation: MapFeaturePresentation, zoom: number | null | undefined) {
  if (!presentation.labelVisible) return false;
  if (zoom == null || !Number.isFinite(zoom)) return true;
  if (presentation.labelMinZoom != null && zoom < presentation.labelMinZoom) return false;
  if (presentation.labelMaxZoom != null && zoom > presentation.labelMaxZoom) return false;
  return true;
}

export function createMapFeatureStyle(ol: any, options: {
  row: WorldMapFeature;
  layerStyle?: Record<string, unknown>;
  labelsEnabled: boolean;
  zoom?: number | null;
  declutterLabels?: boolean;
  pointRadius?: number;
}) {
  const presentation = resolveMapFeaturePresentation(options.row, options.layerStyle);
  const geometryType = options.row.geometry.type;
  const polygon = geometryType.includes("Polygon");
  const line = geometryType.includes("Line");
  const showLabel = options.labelsEnabled && Boolean(options.row.label) && labelVisibleAtZoom(presentation, options.zoom);
  return new ol.style.Style({
    fill: polygon ? new ol.style.Fill({ color: colorWithOpacity(presentation.fill, presentation.fillOpacity) }) : undefined,
    stroke: new ol.style.Stroke({ color: presentation.stroke, width: presentation.strokeWidth }),
    image: line ? undefined : new ol.style.Circle({
      radius: options.pointRadius ?? 7,
      fill: new ol.style.Fill({ color: presentation.fill }),
      stroke: new ol.style.Stroke({ color: presentation.stroke, width: Math.min(3, presentation.strokeWidth) }),
    }),
    text: showLabel ? new ol.style.Text({
      text: options.row.label,
      placement: line ? "line" : "point",
      overflow: options.declutterLabels === false,
      declutterMode: options.declutterLabels === false ? "none" : "declutter",
      offsetX: presentation.labelOffsetX,
      offsetY: presentation.labelOffsetY,
      font: `${presentation.labelWeight} ${presentation.labelSize}px Inter, ui-sans-serif, system-ui, sans-serif`,
      fill: new ol.style.Fill({ color: colorWithOpacity(presentation.labelColor, presentation.labelOpacity) }),
      stroke: presentation.labelHaloWidth > 0 ? new ol.style.Stroke({ color: presentation.labelHalo, width: presentation.labelHaloWidth }) : undefined,
    }) : undefined,
  });
}
