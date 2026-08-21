import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { getExistingEntityAvatarDerivative } from "@/lib/entity-image-derivative-fast";
import { ensureEntityAvatarDerivative, type DerivableEntityType } from "@/lib/entity-image-derivatives";
import { localStorage } from "@/lib/storage";

const ENTITY_TYPES = new Set<DerivableEntityType>(["person","race","culture","group","location"]);

function derivativeEtag(derivative: { derivativeId: number; storagePath: string }) {
  // UPSERT keeps derivative_id stable. The storage path changes whenever a crop/source is rendered
  // again, so it must be part of the validator or browsers can incorrectly reuse the pre-crop file.
  const version = derivative.storagePath.replace(/[^a-z0-9]/gi, "").slice(-24) || "v";
  return `"wr-avatar-${derivative.derivativeId}-${version}"`;
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; entityType: string; entityId: string }> }) {
  if (!(await hasValidAdminSession({ touch: false }))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const raw = await params;
  const projectId = Number.parseInt(raw.projectId, 10);
  const entityId = Number.parseInt(raw.entityId, 10);
  const entityType = raw.entityType as DerivableEntityType;
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || !Number.isSafeInteger(entityId) || entityId <= 0 || !ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    // Managed media uses the one-query fast path. Local legacy paths deliberately fall through to
    // ensureEntityAvatarDerivative so file mtime/size can invalidate the derivative safely.
    const derivative = await getExistingEntityAvatarDerivative(projectId, entityType, entityId)
      ?? await ensureEntityAvatarDerivative(projectId, entityType, entityId);
    if (!derivative) return NextResponse.json({ error: "No derivable image" }, { status: 404 });
    const etag = derivativeEtag(derivative);
    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "private, no-cache" } });
    }
    const data = await localStorage.read(derivative.storagePath);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": derivative.mimeType,
        "Content-Length": String(data.length),
        "Cache-Control": "private, no-cache",
        ETag: etag,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: "Avatar konnte nicht erzeugt werden." }, { status: 500 });
  }
}
