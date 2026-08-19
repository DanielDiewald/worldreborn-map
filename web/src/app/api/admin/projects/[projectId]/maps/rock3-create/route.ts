import { NextResponse } from "next/server";
import { hasValidAdminSession } from "@/lib/auth/session";
import { createRock3MapFromArchive } from "@/lib/rock3-map-set";

export const runtime = "nodejs";

function positiveInt(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  if (!(await hasValidAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = positiveInt((await params).projectId);
  if (!projectId) return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });

  try {
    const form = await request.formData();
    const archive = form.get("archive");
    const name = String(form.get("name") ?? "").trim();
    if (!(archive instanceof File) || archive.size === 0) {
      return NextResponse.json({ error: "Bitte eine Rock-3-ZIP auswählen." }, { status: 400 });
    }

    const result = await createRock3MapFromArchive(projectId, archive, {
      name,
      isPrimary: form.get("isPrimary") !== "false",
    });

    return NextResponse.json(
      {
        ...result,
        editorUrl: `/admin/projects/${projectId}/map/studio?mapId=${result.mapId}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Weltkarte konnte nicht erstellt werden." },
      { status: 400 },
    );
  }
}
