BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Unknown is now a first-class canonical gender instead of a legacy placeholder.
CREATE OR REPLACE FUNCTION public.worldreborn_validate_person_gender() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.gender IS NULL OR NEW.gender NOT IN ('male','female','hermaphrodite','unknown') THEN
    RAISE EXCEPTION 'Person gender must be male, female, hermaphrodite, or unknown';
  END IF;
  RETURN NEW;
END $$;

UPDATE public.npcs
SET gender='unknown'
WHERE gender IS NULL
   OR btrim(gender)=''
   OR lower(btrim(gender)) IN ('unknown','unbekannt','nicht bekannt','n/a','na');

-- Species are a two-level taxonomy: a root species can own subspecies.
ALTER TABLE public.races
  ADD COLUMN parent_race_id bigint,
  ADD COLUMN is_unknown boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT races_parent_race_id_fkey
    FOREIGN KEY (parent_race_id) REFERENCES public.races(race_id) ON UPDATE CASCADE ON DELETE RESTRICT;

CREATE INDEX races_parent_idx
  ON public.races(project_id,parent_race_id,race_id)
  WHERE archived_at IS NULL;

-- Reuse an existing active Unbekannt record when present and guarantee one fallback per project.
UPDATE public.races
SET is_unknown=true,
    parent_race_id=NULL,
    metadata=metadata || '{"system_unknown":true}'::jsonb,
    updated_at=now()
WHERE archived_at IS NULL
  AND lower(btrim(name))='unbekannt';

INSERT INTO public.races(project_id,name,is_unknown,metadata)
SELECT c.camp_id,'Unbekannt',true,'{"system_unknown":true,"created_from":"subspecies_unknown_fallback"}'::jsonb
FROM public.campaigns c
WHERE c.status<>'archived'
  AND NOT EXISTS(
    SELECT 1 FROM public.races r
    WHERE r.project_id=c.camp_id AND r.archived_at IS NULL AND r.is_unknown=true
  );

CREATE UNIQUE INDEX races_one_unknown_per_project_uidx
  ON public.races(project_id)
  WHERE is_unknown AND archived_at IS NULL;

ALTER TABLE public.races
  ADD CONSTRAINT races_unknown_root_check CHECK (
    NOT is_unknown OR (parent_race_id IS NULL AND lower(btrim(name))='unbekannt')
  );

CREATE OR REPLACE FUNCTION public.worldreborn_validate_race_hierarchy() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE parent_project integer;
DECLARE parent_parent_id bigint;
DECLARE parent_archived timestamp with time zone;
DECLARE parent_unknown boolean;
BEGIN
  IF NEW.is_unknown THEN
    IF NEW.parent_race_id IS NOT NULL OR lower(btrim(NEW.name))<>'unbekannt' THEN
      RAISE EXCEPTION 'Unknown race must remain the root species Unbekannt';
    END IF;
    IF NEW.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Unknown race cannot be archived';
    END IF;
  END IF;

  IF NEW.parent_race_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_race_id=NEW.race_id THEN
    RAISE EXCEPTION 'A species cannot be its own parent';
  END IF;

  SELECT project_id,parent_race_id,archived_at,is_unknown
    INTO parent_project,parent_parent_id,parent_archived,parent_unknown
  FROM public.races
  WHERE race_id=NEW.parent_race_id;

  IF parent_project IS NULL OR parent_project<>NEW.project_id OR parent_archived IS NOT NULL THEN
    RAISE EXCEPTION 'Parent species must be active and belong to the same project';
  END IF;
  IF parent_parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'A subspecies cannot be the parent of another subspecies';
  END IF;
  IF parent_unknown THEN
    RAISE EXCEPTION 'Unknown species cannot contain subspecies';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.races child
    WHERE child.parent_race_id=NEW.race_id
      AND child.archived_at IS NULL
      AND child.race_id<>NEW.race_id
  ) THEN
    RAISE EXCEPTION 'A species with active subspecies cannot itself become a subspecies';
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER races_validate_hierarchy
BEFORE INSERT OR UPDATE ON public.races
FOR EACH ROW EXECUTE FUNCTION public.worldreborn_validate_race_hierarchy();

COMMIT;
