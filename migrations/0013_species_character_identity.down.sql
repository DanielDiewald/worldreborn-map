BEGIN;
DROP TRIGGER IF EXISTS person_cultures_validate_project ON public.person_cultures;
DROP TRIGGER IF EXISTS character_ancestry_validate_project ON public.character_ancestry;
DROP FUNCTION IF EXISTS public.worldreborn_validate_species_person_identity_project();
DROP TABLE IF EXISTS public.person_cultures;
DROP TABLE IF EXISTS public.character_ancestry;
COMMIT;
