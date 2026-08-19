import type { WorldMapLayer } from "./map-types";
import { buildLandMaskGuide, type LandMaskGuide, type MapExtent } from "./map-geometry-guides";

const PRECISION_STORAGE_KEY = "worldreborn:land-mask-precision";
const ALLOWED_PRECISIONS = new Set([1024, 2048, 4096, 8192]);

function layerUrl(layer: WorldMapLayer) {
  if (layer.source_type === "media" && layer.media_id) return `/api/media/${layer.media_id}`;
  return layer.source_url;
}

function preferredPrecision(fallback = 4096) {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = Number(window.localStorage.getItem(PRECISION_STORAGE_KEY));
    if (ALLOWED_PRECISIONS.has(saved)) return saved;
  } catch { /* browser preference is optional */ }
  return fallback;
}

async function blobToImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Land Mask konnte nicht als Bild gelesen werden."));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function loadLandMaskGuide(layer: WorldMapLayer | undefined, extent: MapExtent, maxWidth?: number): Promise<LandMaskGuide | null> {
  if (!layer) return null;
  const url = layerUrl(layer);
  if (!url) return null;

  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error("Rock-3-Land-Mask konnte nicht geladen werden.");
  const blob = await response.blob();
  const image = await blobToImage(blob);
  const sourceWidth = image instanceof HTMLImageElement ? image.naturalWidth : image.width;
  const sourceHeight = image instanceof HTMLImageElement ? image.naturalHeight : image.height;
  if (!sourceWidth || !sourceHeight) throw new Error("Rock-3-Land-Mask hat keine gültigen Bildmaße.");

  const requestedWidth = Math.max(512, Math.min(8192, maxWidth ?? preferredPrecision()));
  const scale = Math.min(1, requestedWidth / sourceWidth);
  const width = Math.max(2, Math.round(sourceWidth * scale));
  const height = Math.max(2, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Land-Mask-Analyse wird von diesem Browser nicht unterstützt.");
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) image.close();
  return buildLandMaskGuide(pixels.data, width, height, extent);
}
