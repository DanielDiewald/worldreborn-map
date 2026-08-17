import { readFile } from "node:fs/promises";
import path from "node:path";

const segment = /^\d+$/;
const tileName = /^\d+\.jpeg$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ z: string; x: string; tile: string }> },
) {
  const { z, x, tile } = await params;
  if (!segment.test(z) || !segment.test(x) || !tileName.test(tile)) {
    return new Response("Invalid tile path", { status: 400 });
  }

  const mapRoot = process.env.LEGACY_MAP_ROOT
    ? path.resolve(process.env.LEGACY_MAP_ROOT)
    : path.resolve(process.cwd(), "..", "map");
  const tilePath = path.resolve(mapRoot, z, x, tile);
  if (!tilePath.startsWith(`${mapRoot}${path.sep}`)) {
    return new Response("Invalid tile path", { status: 400 });
  }

  try {
    const bytes = await readFile(tilePath);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String((error as NodeJS.ErrnoException).code) : "";
    if (code === "ENOENT") return new Response("Tile not found", { status: 404 });
    return new Response("Tile unavailable", { status: 500 });
  }
}
