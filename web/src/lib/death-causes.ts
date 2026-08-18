export const DEATH_CAUSE_OPTIONS = [
  { value: "natural_causes", label: "Natürliche Ursachen" },
  { value: "illness", label: "Krankheit" },
  { value: "accident", label: "Unfall" },
  { value: "battle", label: "Im Kampf gefallen" },
  { value: "murder", label: "Ermordet" },
  { value: "execution", label: "Hingerichtet" },
  { value: "poisoning", label: "Vergiftung" },
  { value: "magic", label: "Magie / Fluch" },
  { value: "creature", label: "Kreatur / Monster" },
  { value: "disaster", label: "Katastrophe" },
  { value: "sacrifice", label: "Opfer / Ritual" },
  { value: "unknown", label: "Unbekannt" },
  { value: "other", label: "Andere Ursache" },
] as const;

export type DeathCauseCode = (typeof DEATH_CAUSE_OPTIONS)[number]["value"];

const DEATH_CAUSE_CODES = new Set<string>(DEATH_CAUSE_OPTIONS.map((option) => option.value));

export function parseDeathCauseCode(value: unknown): DeathCauseCode | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return DEATH_CAUSE_CODES.has(normalized) ? normalized as DeathCauseCode : null;
}

export function deathCauseLabel(value: string | null | undefined) {
  if (!value) return null;
  return DEATH_CAUSE_OPTIONS.find((option) => option.value === value)?.label ?? null;
}
