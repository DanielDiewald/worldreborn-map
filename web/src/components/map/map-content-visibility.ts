import type { WorldMapFeature } from "./map-types";

export type MapContentCategory =
  | "countries"
  | "provinces"
  | "regions"
  | "settlements"
  | "places"
  | "rivers"
  | "roads"
  | "other";

export type MapContentVisibility = Record<MapContentCategory | "markers" | "labels", boolean>;

export const MAP_CONTENT_FILTERS: Array<{ id: keyof MapContentVisibility; label: string; hint: string; icon: string }> = [
  { id: "countries", label: "Länder", hint: "Landesflächen und Grenzen", icon: "◇" },
  { id: "provinces", label: "Provinzen", hint: "Untergebiete von Ländern", icon: "▱" },
  { id: "regions", label: "Regionen", hint: "Politische und geografische Regionen", icon: "▧" },
  { id: "settlements", label: "Städte & Dörfer", hint: "Städte, Orte und Siedlungen", icon: "●" },
  { id: "places", label: "Orte & Landmarken", hint: "Gebäude, Bezirke und besondere Orte", icon: "⌖" },
  { id: "rivers", label: "Flüsse", hint: "Flussläufe", icon: "≈" },
  { id: "roads", label: "Straßen", hint: "Straßen und Routen", icon: "━" },
  { id: "other", label: "Sonstige", hint: "Weitere Kartenobjekte", icon: "•" },
  { id: "markers", label: "Marker", hint: "Manuell gesetzte Kartenmarker", icon: "◎" },
  { id: "labels", label: "Beschriftungen", hint: "Namen auf der Karte", icon: "Aa" },
];

export const DEFAULT_MAP_CONTENT_VISIBILITY: MapContentVisibility = {
  countries: true,
  provinces: true,
  regions: true,
  settlements: true,
  places: true,
  rivers: true,
  roads: true,
  other: true,
  markers: true,
  labels: true,
};

export function featureContentCategory(row: Pick<WorldMapFeature, "geometry" | "location_kind" | "metadata">): MapContentCategory {
  const kind = row.location_kind ?? null;
  if (kind === "country") return "countries";
  if (kind === "province") return "provinces";
  if (kind === "region" || kind === "continent" || kind === "world") return "regions";
  if (["city", "town", "village"].includes(kind ?? "")) return "settlements";
  if (["district", "building", "landmark", "wilderness"].includes(kind ?? "")) return "places";

  const tool = typeof row.metadata?.tool === "string" ? row.metadata.tool : "";
  if (tool === "country") return "countries";
  if (tool === "province") return "provinces";
  if (tool === "region") return "regions";
  if (tool === "city") return "settlements";
  if (tool === "place") return "places";
  if (tool === "river") return "rivers";
  if (tool === "road") return "roads";

  return "other";
}

export function allContentVisibility(visible: boolean): MapContentVisibility {
  return Object.fromEntries(Object.keys(DEFAULT_MAP_CONTENT_VISIBILITY).map((key) => [key, visible])) as MapContentVisibility;
}
