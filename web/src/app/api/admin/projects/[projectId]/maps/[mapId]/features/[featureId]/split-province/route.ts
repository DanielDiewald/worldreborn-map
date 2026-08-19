import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { splitPoliticalFeatureIntoProvinces } from "@/lib/map-political-split";

function positiveInt(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; mapId: string; featureId: string }> }) {
  if (!(await hasValidAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = await params;
  const projectId = positiveInt(raw.projectId), mapId = positiveInt(raw.mapId), featureId = positiveInt(raw.featureId);
  if (!projectId || !mapId || !featureId) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  try {
    const result = await splitPoliticalFeatureIntoProvinces(projectId, mapId, featureId, await request.json());
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Provinzen konnten nicht geteilt werden." }, { status: 400 });
  }
}
