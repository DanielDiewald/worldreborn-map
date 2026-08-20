import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { ensureEntityAvatarDerivative, type DerivableEntityType } from "@/lib/entity-image-derivatives";
import { localStorage } from "@/lib/storage";

const ENTITY_TYPES = new Set<DerivableEntityType>(["person","race","culture","group","location"]);

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
    const derivative = await ensureEntityAvatarDerivative(projectId, entityType, entityId);
    if (!derivative) return NextResponse.json({ error: "No managed image" }, { status: 404 });
    const etag = `"wr-avatar-${derivative.derivativeId}"`;
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
