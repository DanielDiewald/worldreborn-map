import type { EntityImageCrop } from "@/lib/entity-image-crop";

export const SPECIES_AVATAR_SIZE = 58;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function squareCropRect(width: number, height: number, crop: EntityImageCrop) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const zoom = clamp(crop.zoom, 1, 4);
  const side = Math.min(safeWidth, safeHeight) / zoom;
  const focusX = safeWidth * clamp(crop.x, 0, 100) / 100;
  const focusY = safeHeight * clamp(crop.y, 0, 100) / 100;
  return {
    sx: clamp(focusX - side / 2, 0, Math.max(0, safeWidth - side)),
    sy: clamp(focusY - side / 2, 0, Math.max(0, safeHeight - side)),
    side,
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    try {
      const url = new URL(src, window.location.href);
      if (url.origin !== window.location.origin) image.crossOrigin = "anonymous";
    } catch { /* relative/internal source */ }
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Speziesbild konnte nicht geladen werden."));
    image.src = src;
  });
}

/**
 * Builds the map-only avatar. The source image remains untouched.
 * With a saved crop we render that exact profile focus into a square and clip it to a circle.
 * Without a crop we keep the complete original visible (contain) inside the circular frame.
 */
export async function createCircularSpeciesAvatar(src: string, crop: EntityImageCrop | null | undefined, size = SPECIES_AVATAR_SIZE) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const pixelRatio = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const outputSize = Math.round(size * pixelRatio);
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas für Speziesmarker ist nicht verfügbar.");

  context.save();
  context.beginPath();
  context.arc(outputSize / 2, outputSize / 2, outputSize / 2 - 2 * pixelRatio, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = "#15181e";
  context.fillRect(0, 0, outputSize, outputSize);

  if (crop) {
    const rect = squareCropRect(image.naturalWidth || image.width, image.naturalHeight || image.height, crop);
    context.drawImage(image, rect.sx, rect.sy, rect.side, rect.side, 0, 0, outputSize, outputSize);
  } else {
    const width = Math.max(1, image.naturalWidth || image.width);
    const height = Math.max(1, image.naturalHeight || image.height);
    const scale = Math.min(outputSize / width, outputSize / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    context.drawImage(image, (outputSize - drawWidth) / 2, (outputSize - drawHeight) / 2, drawWidth, drawHeight);
  }
  context.restore();

  context.beginPath();
  context.arc(outputSize / 2, outputSize / 2, outputSize / 2 - 2.5 * pixelRatio, 0, Math.PI * 2);
  context.strokeStyle = "rgba(224,194,118,.95)";
  context.lineWidth = 2.5 * pixelRatio;
  context.stroke();

  return canvas.toDataURL("image/png");
}
