export const LOCAL_DERIVATIVE_IMAGE_PREFIXES = ["/img/", "/images/", "/uploads/"] as const;

const LOCAL_IMAGE_EXTENSION = /\.(?:jpe?g|png|webp|gif)$/i;
const MANAGED_MEDIA_PATTERN = /^\/api\/media\/(\d+)$/;

export type DerivativeImageSourceRef =
  | { kind: "none"; source: null }
  | { kind: "external"; source: string }
  | { kind: "managed_media"; source: string; mediaId: number }
  | { kind: "local_path"; source: string; localPath: string };

function decodePath(value: string) {
  let decoded = value;
  for (let index = 0; index < 2; index += 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return null;
    }
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function normalizeLocalImagePath(value: string) {
  const decoded = decodePath(value);
  if (!decoded || decoded.includes("\0") || decoded.includes("\\")) return null;
  if (/^[a-z]:/i.test(decoded) || decoded.startsWith("//")) return null;
  const prefix = LOCAL_DERIVATIVE_IMAGE_PREFIXES.find((candidate) => decoded.startsWith(candidate));
  if (!prefix) return null;

  const segments = decoded.split("/");
  if (segments.some((segment) => segment === "..")) return null;
  const normalized = `/${segments.filter((segment, index) => index === 0 || (segment && segment !== ".")).slice(1).join("/")}`;
  if (!normalized.startsWith(prefix) || !LOCAL_IMAGE_EXTENSION.test(normalized)) return null;
  return normalized;
}

export function classifyDerivativeImageSource(value: string | null | undefined): DerivativeImageSourceRef {
  const source = value?.trim() ?? "";
  if (!source || source === "noimage" || source === "/noimg.jpg") return { kind: "none", source: null };

  const managed = source.match(MANAGED_MEDIA_PATTERN);
  if (managed) {
    const mediaId = Number(managed[1]);
    return Number.isSafeInteger(mediaId) && mediaId > 0
      ? { kind: "managed_media", source, mediaId }
      : { kind: "none", source: null };
  }

  if (/^https?:\/\//i.test(source) || source.startsWith("//")) return { kind: "external", source };

  const localPath = normalizeLocalImagePath(source);
  if (localPath) return { kind: "local_path", source, localPath };
  return { kind: "none", source: null };
}

export function imageReferenceUsesAvatarDerivative(value: string | null | undefined) {
  const source = classifyDerivativeImageSource(value);
  return source.kind === "managed_media" || source.kind === "local_path" || source.kind === "external";
}
