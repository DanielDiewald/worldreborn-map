import { NextResponse } from "next/server";
import { getPlayerSession } from "@/lib/auth/player-session";
import { getVisibleMapMarkers } from "@/lib/maps";

export async function GET(_request: Request, { params }: { params: Promise<{ mapId: string }> }) {
  const session = await getPlayerSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const mapId = Number.parseInt((await params).mapId, 10);
  if (!Number.isSafeInteger(mapId) || mapId <= 0) return NextResponse.json({ error: "Invalid map ID" }, { status: 400 });

  try {
    const markers = await getVisibleMapMarkers(session.projectId, mapId, session.playerId);
    return NextResponse.json({ markers });
  } catch {
    return NextResponse.json({ error: "Map not found" }, { status: 404 });
  }
}
