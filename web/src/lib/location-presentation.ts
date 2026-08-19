import type { LocationKind } from "@/lib/entities/locations";

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  world: "Welt",
  continent: "Kontinent",
  country: "Land",
  region: "Region",
  province: "Provinz",
  city: "Stadt",
  town: "Kleinstadt",
  village: "Dorf",
  district: "Bezirk",
  building: "Gebäude",
  landmark: "Sehenswürdigkeit",
  wilderness: "Wildnis",
  other: "Andere",
};

export function locationKindLabel(kind: LocationKind | string) {
  return LOCATION_KIND_LABELS[kind as LocationKind] ?? kind;
}

export function allowedParentKinds(kind: LocationKind): LocationKind[] {
  if (kind === "world") return [];
  if (kind === "continent") return ["world"];
  if (kind === "country") return ["continent", "world"];
  if (kind === "region" || kind === "province") return ["country", "continent"];
  if (kind === "city" || kind === "town" || kind === "village") return ["province", "region", "country"];
  if (kind === "district") return ["city", "town"];
  if (kind === "building" || kind === "landmark") return ["district", "city", "town", "village", "province", "region", "country"];
  if (kind === "wilderness") return ["province", "region", "country", "continent"];
  return ["building", "district", "city", "town", "village", "province", "region", "country", "continent", "world", "wilderness", "other"];
}
