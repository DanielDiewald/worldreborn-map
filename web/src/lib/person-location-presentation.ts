import type { PERSON_LOCATION_ROLES } from "@/lib/person-locations";

export type PersonLocationRole=(typeof PERSON_LOCATION_ROLES)[number];

export const PERSON_LOCATION_ROLE_LABELS:Record<PersonLocationRole,string>={
  current:"Aktueller Ort",
  home:"Wohnort / Heimat",
  birthplace:"Geburtsort",
  workplace:"Arbeitsplatz",
  seat:"Sitz",
  origin:"Herkunft",
  temporary:"Temporärer Aufenthalt",
  other:"Weiterer Ort",
};

export function personLocationRoleLabel(role:string){return PERSON_LOCATION_ROLE_LABELS[role as PersonLocationRole]??role;}
