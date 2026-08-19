export const MAP_KINDS = ["world", "continent", "region", "city", "building", "dungeon", "other"] as const;
export type MapKind = (typeof MAP_KINDS)[number];

export const MAP_KIND_LABELS: Record<MapKind, string> = {
  world: "Weltkarte",
  continent: "Kontinentkarte",
  region: "Regionskarte",
  city: "Stadtkarte",
  building: "Gebäudeplan",
  dungeon: "Dungeon",
  other: "Andere Karte",
};

export function mapKindFromConfig(config: Record<string, unknown> | null | undefined): MapKind {
  const raw = typeof config?.map_kind === "string" ? config.map_kind : "";
  return MAP_KINDS.includes(raw as MapKind) ? raw as MapKind : config?.rock3 === true ? "world" : "other";
}

export function mapKindLabel(config: Record<string, unknown> | null | undefined) {
  return MAP_KIND_LABELS[mapKindFromConfig(config)];
}
