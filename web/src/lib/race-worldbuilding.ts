export const RACE_BIOLOGY_FIELDS = [
  { key: "lifespanYears", label: "Lebenserwartung", unit: "Jahre", kind: "number" },
  { key: "adulthoodYears", label: "Volljährigkeit", unit: "Jahre", kind: "number" },
  { key: "heightCmMin", label: "Größe min.", unit: "cm", kind: "number" },
  { key: "heightCmMax", label: "Größe max.", unit: "cm", kind: "number" },
  { key: "weightKgMin", label: "Gewicht min.", unit: "kg", kind: "number" },
  { key: "weightKgMax", label: "Gewicht max.", unit: "kg", kind: "number" },
  { key: "diet", label: "Ernährung", unit: null, kind: "text" },
  { key: "reproduction", label: "Fortpflanzung", unit: null, kind: "text" },
  { key: "preferredClimate", label: "Bevorzugtes Klima", unit: null, kind: "text" },
  { key: "senses", label: "Sinne", unit: null, kind: "text" },
  { key: "magicAffinity", label: "Magische Affinität", unit: null, kind: "text" },
  { key: "bodyFeatures", label: "Typische Körpermerkmale", unit: null, kind: "text" },
] as const;

export type RaceBiologyKey = (typeof RACE_BIOLOGY_FIELDS)[number]["key"];
export type RaceBiology = Partial<Record<RaceBiologyKey, string | number>>;

export type RaceTraitValue = {
  traitKey: string;
  label: string;
  value: string;
  unit: string | null;
  notes: string | null;
  inheritedFromRaceId?: number | null;
  inheritedFromRaceName?: string | null;
};

const fieldKeys = new Set<string>(RACE_BIOLOGY_FIELDS.map((field) => field.key));
const numericKeys = new Set<string>(RACE_BIOLOGY_FIELDS.filter((field) => field.kind === "number").map((field) => field.key));

export function normalizeRaceBiology(input: unknown): RaceBiology {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const result: RaceBiology = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!fieldKeys.has(key) || raw == null || raw === "") continue;
    if (numericKeys.has(key)) {
      const value = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(value) && value >= 0) result[key as RaceBiologyKey] = value;
      continue;
    }
    if (typeof raw === "string" && raw.trim()) result[key as RaceBiologyKey] = raw.trim().slice(0, 4000);
  }
  return result;
}

export function inheritRaceBiology(parent: RaceBiology | null | undefined, own: RaceBiology | null | undefined) {
  const parentClean = normalizeRaceBiology(parent);
  const ownClean = normalizeRaceBiology(own);
  const effective: RaceBiology = { ...parentClean, ...ownClean };
  const inheritedKeys = new Set<RaceBiologyKey>();
  for (const field of RACE_BIOLOGY_FIELDS) {
    if (ownClean[field.key] == null && parentClean[field.key] != null) inheritedKeys.add(field.key);
  }
  return { effective, inheritedKeys };
}

export function inheritRaceTraits(parent: RaceTraitValue[], own: RaceTraitValue[]) {
  const result = new Map<string, RaceTraitValue>();
  for (const trait of parent) result.set(trait.traitKey, { ...trait });
  for (const trait of own) result.set(trait.traitKey, { ...trait, inheritedFromRaceId: null, inheritedFromRaceName: null });
  return [...result.values()].sort((a, b) => a.label.localeCompare(b.label, "de"));
}

export function raceTraitKey(label: string) {
  return label.trim().toLocaleLowerCase("de").replace(/[^a-z0-9äöüß]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
