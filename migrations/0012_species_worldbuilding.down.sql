BEGIN;

DROP TRIGGER IF EXISTS cultures_validate_location ON public.cultures;
DROP FUNCTION IF EXISTS public.worldreborn_validate_culture_location();
DROP TRIGGER IF EXISTS race_relations_validate_project ON public.race_relations;
DROP TRIGGER IF EXISTS race_location_links_validate_project ON public.race_location_links;
DROP TRIGGER IF EXISTS culture_races_validate_project ON public.culture_races;
DROP TRIGGER IF EXISTS race_traits_validate_project ON public.race_traits;
DROP FUNCTION IF EXISTS public.worldreborn_validate_species_worldbuilding_project();

DROP TABLE IF EXISTS public.race_relations;
DROP TABLE IF EXISTS public.race_location_links;
DROP TABLE IF EXISTS public.culture_races;
DROP TABLE IF EXISTS public.cultures;
DROP TABLE IF EXISTS public.race_traits;

ALTER TABLE public.races DROP CONSTRAINT IF EXISTS races_biology_object_check;
ALTER TABLE public.races DROP COLUMN IF EXISTS biology;

COMMIT;
