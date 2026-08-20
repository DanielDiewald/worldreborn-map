BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Structured biology lives on the species row. Subspecies inherit missing values in application logic.
ALTER TABLE public.races
  ADD COLUMN biology jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT races_biology_object_check CHECK (jsonb_typeof(biology)='object');

CREATE TABLE public.race_traits (
  trait_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  race_id bigint NOT NULL REFERENCES public.races(race_id) ON UPDATE CASCADE ON DELETE CASCADE,
  trait_key character varying(80) NOT NULL,
  label character varying(120) NOT NULL,
  value text NOT NULL,
  unit character varying(40),
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT race_traits_key_nonempty CHECK (btrim(trait_key)<>''),
  CONSTRAINT race_traits_label_nonempty CHECK (btrim(label)<>''),
  CONSTRAINT race_traits_value_nonempty CHECK (btrim(value)<>'')
);
CREATE UNIQUE INDEX race_traits_race_key_uidx ON public.race_traits(race_id,lower(btrim(trait_key)));
CREATE INDEX race_traits_project_race_idx ON public.race_traits(project_id,race_id,sort_order,trait_id);

CREATE TABLE public.cultures (
  culture_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  name character varying(160) NOT NULL,
  description text,
  image text NOT NULL DEFAULT 'noimage',
  image_media_id bigint REFERENCES public.media(media_id) ON DELETE SET NULL,
  primary_location_id integer REFERENCES public.locations(loc_id) ON UPDATE CASCADE ON DELETE SET NULL,
  visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cultures_name_nonempty CHECK (btrim(name)<>''),
  CONSTRAINT cultures_visibility_check CHECK (visibility_mode IN ('admin_only','all_players','selected_players'))
);
CREATE UNIQUE INDEX cultures_project_name_uidx ON public.cultures(project_id,lower(btrim(name))) WHERE archived_at IS NULL;
CREATE INDEX cultures_project_idx ON public.cultures(project_id,archived_at,name,culture_id);

CREATE TABLE public.culture_races (
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  culture_id bigint NOT NULL REFERENCES public.cultures(culture_id) ON UPDATE CASCADE ON DELETE CASCADE,
  race_id bigint NOT NULL REFERENCES public.races(race_id) ON UPDATE CASCADE ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY(culture_id,race_id)
);
CREATE INDEX culture_races_project_idx ON public.culture_races(project_id,culture_id,race_id);

CREATE TABLE public.race_location_links (
  link_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  race_id bigint NOT NULL REFERENCES public.races(race_id) ON UPDATE CASCADE ON DELETE CASCADE,
  location_id integer NOT NULL REFERENCES public.locations(loc_id) ON UPDATE CASCADE ON DELETE CASCADE,
  role character varying(30) NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT race_location_role_check CHECK (role IN ('origin','historical_home','core','distribution'))
);
CREATE UNIQUE INDEX race_location_links_uidx ON public.race_location_links(race_id,location_id,role);
CREATE INDEX race_location_links_project_idx ON public.race_location_links(project_id,race_id,role,location_id);

CREATE TABLE public.race_relations (
  relation_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  race_id bigint NOT NULL REFERENCES public.races(race_id) ON UPDATE CASCADE ON DELETE CASCADE,
  related_race_id bigint NOT NULL REFERENCES public.races(race_id) ON UPDATE CASCADE ON DELETE CASCADE,
  relation_type character varying(30) NOT NULL,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT race_relations_not_self CHECK (race_id<>related_race_id),
  CONSTRAINT race_relations_type_check CHECK (relation_type IN ('related','descended_from','created_from','mutation_of','hybrid_of'))
);
CREATE UNIQUE INDEX race_relations_uidx ON public.race_relations(race_id,related_race_id,relation_type);
CREATE INDEX race_relations_project_idx ON public.race_relations(project_id,race_id,related_race_id);

-- Keep all worldbuilding joins inside one project even for SQL written outside the web app.
CREATE OR REPLACE FUNCTION public.worldreborn_validate_species_worldbuilding_project() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE actual_project integer;
BEGIN
  IF TG_TABLE_NAME='race_traits' THEN
    SELECT project_id INTO actual_project FROM public.races WHERE race_id=NEW.race_id;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Race trait species must belong to the same project'; END IF;
  ELSIF TG_TABLE_NAME='culture_races' THEN
    SELECT project_id INTO actual_project FROM public.cultures WHERE culture_id=NEW.culture_id AND archived_at IS NULL;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Culture must belong to the same project'; END IF;
    SELECT project_id INTO actual_project FROM public.races WHERE race_id=NEW.race_id AND archived_at IS NULL;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Culture species must belong to the same project'; END IF;
  ELSIF TG_TABLE_NAME='race_location_links' THEN
    SELECT project_id INTO actual_project FROM public.races WHERE race_id=NEW.race_id AND archived_at IS NULL;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Distribution species must belong to the same project'; END IF;
    SELECT camp_id INTO actual_project FROM public.locations WHERE loc_id=NEW.location_id AND archived_at IS NULL;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Distribution location must belong to the same project'; END IF;
  ELSIF TG_TABLE_NAME='race_relations' THEN
    SELECT project_id INTO actual_project FROM public.races WHERE race_id=NEW.race_id AND archived_at IS NULL;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Source species must belong to the same project'; END IF;
    SELECT project_id INTO actual_project FROM public.races WHERE race_id=NEW.related_race_id AND archived_at IS NULL;
    IF actual_project IS NULL OR actual_project<>NEW.project_id THEN RAISE EXCEPTION 'Related species must belong to the same project'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER race_traits_validate_project BEFORE INSERT OR UPDATE ON public.race_traits FOR EACH ROW EXECUTE FUNCTION public.worldreborn_validate_species_worldbuilding_project();
CREATE TRIGGER culture_races_validate_project BEFORE INSERT OR UPDATE ON public.culture_races FOR EACH ROW EXECUTE FUNCTION public.worldreborn_validate_species_worldbuilding_project();
CREATE TRIGGER race_location_links_validate_project BEFORE INSERT OR UPDATE ON public.race_location_links FOR EACH ROW EXECUTE FUNCTION public.worldreborn_validate_species_worldbuilding_project();
CREATE TRIGGER race_relations_validate_project BEFORE INSERT OR UPDATE ON public.race_relations FOR EACH ROW EXECUTE FUNCTION public.worldreborn_validate_species_worldbuilding_project();

CREATE OR REPLACE FUNCTION public.worldreborn_validate_culture_location() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE location_project integer;
BEGIN
  IF NEW.primary_location_id IS NULL THEN RETURN NEW; END IF;
  SELECT camp_id INTO location_project FROM public.locations WHERE loc_id=NEW.primary_location_id AND archived_at IS NULL;
  IF location_project IS NULL OR location_project<>NEW.project_id THEN RAISE EXCEPTION 'Culture location must belong to the same project'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER cultures_validate_location BEFORE INSERT OR UPDATE ON public.cultures FOR EACH ROW EXECUTE FUNCTION public.worldreborn_validate_culture_location();

COMMIT;
