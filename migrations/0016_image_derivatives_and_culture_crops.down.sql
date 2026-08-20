BEGIN;

DROP TABLE IF EXISTS public.entity_image_derivatives;

DROP INDEX IF EXISTS public.charakters_race_person_idx;
DROP INDEX IF EXISTS public.races_project_parent_active_idx;
DROP INDEX IF EXISTS public.cultures_project_active_name_idx;

-- Rolling back 0016 removes the culture-specific crop capability. The original culture images are
-- untouched; only their optional non-destructive crop metadata is removed.
DELETE FROM public.entity_image_crops WHERE entity_type='culture';
ALTER TABLE public.entity_image_crops
  DROP CONSTRAINT IF EXISTS entity_image_crops_type_check;
ALTER TABLE public.entity_image_crops
  ADD CONSTRAINT entity_image_crops_type_check
  CHECK (entity_type IN ('person','race'));

COMMIT;
