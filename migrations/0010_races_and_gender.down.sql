BEGIN;

DROP INDEX IF EXISTS public.charakters_race_id_idx;
ALTER TABLE public.charakters DROP COLUMN IF EXISTS race_id;
DROP TABLE IF EXISTS public.races;

-- Keep npcs.gender at varchar(20) on rollback. Shrinking back to varchar(10) would truncate
-- the valid canonical value "hermaphrodite" and would make rollback destructive.

COMMIT;
