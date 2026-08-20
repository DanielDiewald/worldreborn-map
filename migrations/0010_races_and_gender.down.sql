BEGIN;

DROP INDEX IF EXISTS public.charakters_race_id_idx;
ALTER TABLE public.charakters DROP COLUMN IF EXISTS race_id;
DROP TRIGGER IF EXISTS races_validate_origin_map ON public.races;
DROP TABLE IF EXISTS public.races;
DROP FUNCTION IF EXISTS public.worldreborn_validate_race_origin_map();

-- Keep npcs.gender at varchar(20) on rollback. Shrinking back to varchar(10) would truncate
-- the valid canonical value "hermaphrodite" and would make rollback destructive.

COMMIT;
