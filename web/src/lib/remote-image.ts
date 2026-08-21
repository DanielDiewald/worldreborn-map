import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicRemoteAddress, parseRemoteImageUrl } from "@/lib/remote-image-policy";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MAX_BYTES = Number.parseInt(process.env.MEDIA_MAX_BYTES ?? String(DEFAULT_MAX_BYTES), 10);
const TIMEOUT_MS = Number.parseInt(process.env.REMOTE_IMAGE_TIMEOUT_MS ?? "12000", 10);
const MAX_REDIRECTS = 4;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

function safeLimit(value: number, fallback: number) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

async function assertPublicRemoteHost(url: URL) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    if (!isPublicRemoteAddress(hostname)) throw new Error("Private oder lokale Bild-Adressen sind nicht erlaubt.");
    return;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Der Host der Bild-URL konnte nicht aufgelöst werden.");
  }
  if (!addresses.length || addresses.some((entry) => !isPublicRemoteAddress(entry.address))) {
    throw new Error("Die Bild-URL darf nicht auf private oder lokale Netzwerkadressen zeigen.");
  }
}

async function readLimitedBody(response: Response) {
  const maxBytes = safeLimit(MAX_BYTES, DEFAULT_MAX_BYTES);
  const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(`Das externe Bild ist zu groß. Maximum: ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  }
  if (!response.body) throw new Error("Die externe Bild-URL hat keinen Inhalt geliefert.");

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Das externe Bild ist zu groß. Maximum: ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

export type DownloadedRemoteImage = {
  buffer: Buffer;
  requestedUrl: string;
  finalUrl: string;
};

export async function downloadRemoteImage(value: string): Promise<DownloadedRemoteImage> {
  const requested = parseRemoteImageUrl(value);
  let current = requested;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicRemoteHost(current);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: AbortSignal.timeout(safeLimit(TIMEOUT_MS, 12000)),
        headers: {
          Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif,image/*;q=0.8,*/*;q=0.2",
          "User-Agent": "WorldReborn-Image-Importer/1.0",
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") throw new Error("Zeitüberschreitung beim Laden der externen Bild-URL.");
      throw new Error("Die externe Bild-URL konnte nicht geladen werden.");
    }

    if (REDIRECTS.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Die externe Bild-URL liefert eine ungültige Weiterleitung.");
      if (redirectCount >= MAX_REDIRECTS) throw new Error("Die externe Bild-URL hat zu viele Weiterleitungen.");
      current = parseRemoteImageUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Die externe Bild-URL antwortet mit HTTP ${response.status}.`);

    return {
      buffer: await readLimitedBody(response),
      requestedUrl: requested.toString(),
      finalUrl: current.toString(),
    };
  }

  throw new Error("Die externe Bild-URL konnte nicht geladen werden.");
}
