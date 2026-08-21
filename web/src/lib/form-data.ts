import "server-only";

export function formHas(formData: FormData, name: string) {
  return formData.has(name);
}

export function formText(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export function formOptionalText(formData: FormData, name: string) {
  const value = formText(formData, name);
  return value || null;
}

export function formCheckbox(formData: FormData, name: string) {
  const value = formData.get(name);
  return value === "on" || value === "1" || value === "true";
}

export function formOptionalId(formData: FormData, name: string) {
  const raw = formText(formData, name);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function formRequiredId(formData: FormData, name: string, label: string) {
  const value = formOptionalId(formData, name);
  if (!value) throw new Error(`${label} ist ein Pflichtfeld.`);
  return value;
}

export function formOptionalNumber(formData: FormData, name: string) {
  const raw = formText(formData, name);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name}: Bitte eine gültige Zahl eingeben.`);
  return value;
}

export function formEnum<T extends string>(formData: FormData, name: string, allowed: readonly T[], fallback?: T) {
  const value = formText(formData, name);
  if ((allowed as readonly string[]).includes(value)) return value as T;
  if (fallback !== undefined) return fallback;
  throw new Error(`${name}: Ungültige Auswahl.`);
}
