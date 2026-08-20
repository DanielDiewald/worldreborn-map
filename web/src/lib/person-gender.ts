export const PERSON_GENDER_OPTIONS = [
  { value: "male", label: "Männlich" },
  { value: "female", label: "Weiblich" },
  { value: "hermaphrodite", label: "Hermaphrodit" },
] as const;

export type PersonGender = (typeof PERSON_GENDER_OPTIONS)[number]["value"];

export function isPersonGender(value: unknown): value is PersonGender {
  return PERSON_GENDER_OPTIONS.some((option) => option.value === value);
}

export function personGenderLabel(value: string | null | undefined) {
  return PERSON_GENDER_OPTIONS.find((option) => option.value === value)?.label ?? (value?.trim() || "Nicht zugeordnet");
}
