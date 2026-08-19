import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { searchAdminMapSpatialEntities } from "@/lib/map-spatial-search";

function positiveInt(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; mapId: string }> }) {
  if (!(await hasValidAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await params;
  const projectId = positiveInt(raw.projectId);
  const mapId = positiveInt(raw.mapId);
  if (!projectId || !mapId) return NextResponse.json({ error: "Invalid project or map ID" }, { status: 400 });
  const url = new URL(request.url);
  const items = await searchAdminMapSpatialEntities(projectId, mapId, url.searchParams.get("q") ?? "");
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
