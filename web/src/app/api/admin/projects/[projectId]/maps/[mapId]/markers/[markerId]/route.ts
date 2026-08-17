import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { deleteMapMarker, moveMapMarker, updateMapMarker } from "@/lib/maps";

function positiveInt(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function ids(params: Promise<{ projectId: string; mapId: string; markerId: string }>) {
  const raw = await params;
  return {
    projectId: positiveInt(raw.projectId),
    mapId: positiveInt(raw.mapId),
    markerId: positiveInt(raw.markerId),
  };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string; mapId: string; markerId: string }> }) {
  if (!(await hasValidAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await ids(params);
  if (!parsed.projectId || !parsed.mapId || !parsed.markerId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  try {
    const body = await request.json();
    if (body && body.operation === "move") {
      await moveMapMarker(parsed.projectId, parsed.mapId, parsed.markerId, body.position ?? {});
    } else {
      await updateMapMarker(parsed.projectId, parsed.mapId, parsed.markerId, body);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Marker could not be updated" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ projectId: string; mapId: string; markerId: string }> }) {
  if (!(await hasValidAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await ids(params);
  if (!parsed.projectId || !parsed.mapId || !parsed.markerId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  try {
    await deleteMapMarker(parsed.projectId, parsed.mapId, parsed.markerId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Marker could not be deleted" }, { status: 404 });
  }
}
