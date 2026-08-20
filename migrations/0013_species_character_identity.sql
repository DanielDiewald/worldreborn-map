BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

CREATE TABLE public.character_ancestry (
  ancestry_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  char_id integer NOT NULL REFERENCES public.charakters(char_id) ON UPDATE CASCADE ON DELETE CASCADE,
  race_id bigint NOT NULL REFERENCES public.races(race_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  relation character varying(30) NOT NULL DEFAULT 'ancestry',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT character_ancestry_relation_check CHECK (relation IN ('ancestry','parental','heritage'))
);
CREATE UNIQUE INDEX character_ancestry_uidx ON public.character_ancestry(char_id,race_id,relation);
CREATE INDEX character_ancestry_project_idx ON public.character_ancestry(project_id,char_id,race_id);

CREATE TABLE public.person_cultures (
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES public.npcs(n_id) ON UPDATE CASCADE ON DELETE CASCADE,
  culture_id bigint NOT NULL REFERENCES public.cultures(culture_id) ON UPDATE CASCADE ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY(person_id,culture_id)
);
CREATE INDEX person_cultures_project_idx ON public.person_cultures(project_id,person_id,culture_id);

CREATE OR REPLACE FUNCTION public.worldreborn_validate_species_person_identity_project() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE actual_project integer;
BEGIN
  IF TG_TABLE_NAME='character_ancestry' THEN
    SELECT n.camp_id INTO actual_project FROM public.charakters c JOIN public.npcs n ON n.n_id=c.n_id WHERE c.char_id=NEW.char_id;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Character ancestry must belong to the same project'; END IF;
    SELECT project_id INTO actual_project FROM public.races WHERE race_id=NEW.race_id AND archived_at IS NULL;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Ancestry species must belong to the same project'; END IF;
  ELSIF TG_TABLE_NAME='person_cultures' THEN
    SELECT camp_id INTO actual_project FROM public.npcs WHERE n_id=NEW.person_id AND archived_at IS NULL;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Person culture must belong to the same project'; END IF;
    SELECT project_id INTO actual_project FROM public.cultures WHERE culture_id=NEW.culture_id AND archived_at IS NULL;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Culture must belong to the same project'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER character_ancestry_validate_project BEFORE INSERT OR UPDATE ON public.character_ancestry FOR EACH ROW EXECUTE FUNCTION public.worldreborn_validate_species_person_identity_project();
CREATE TRIGGER person_cultures_validate_project BEFORE INSERT OR UPDATE ON public.person_cultures FOR EACH ROW EXECUTE FUNCTION public.worldreborn_validate_species_person_identity_project();

COMMIT;
