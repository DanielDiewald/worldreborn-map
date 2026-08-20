import { PERSON_GENDER_OPTIONS, isPersonGender } from "@/lib/person-gender";

export function PersonGenderSelect({ name = "gender", defaultValue, required = true }: {
  name?: string;
  defaultValue?: string | null;
  required?: boolean;
}) {
  const canonical = isPersonGender(defaultValue) ? defaultValue : "";
  const legacy = defaultValue?.trim() && !isPersonGender(defaultValue) ? defaultValue.trim() : null;
  return <>
    <select name={name} defaultValue={canonical} required={required}>
      <option value="" disabled>{legacy ? `Bitte zuordnen (bisher: ${legacy})` : "Geschlecht wählen"}</option>
      {PERSON_GENDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {legacy ? <small className="muted">Der bisherige freie Wert „{legacy}“ muss einmalig einer der drei kanonischen Optionen zugeordnet werden.</small> : null}
  </>;
}
