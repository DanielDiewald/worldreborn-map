BEGIN;

DROP TRIGGER IF EXISTS races_validate_hierarchy ON public.races;
DROP FUNCTION IF EXISTS public.worldreborn_validate_race_hierarchy();
DROP INDEX IF EXISTS public.races_one_unknown_per_project_uidx;
DROP INDEX IF EXISTS public.races_parent_idx;
ALTER TABLE public.races DROP CONSTRAINT IF EXISTS races_unknown_root_check;
ALTER TABLE public.races DROP CONSTRAINT IF EXISTS races_parent_race_id_fkey;
ALTER TABLE public.races DROP COLUMN IF EXISTS parent_race_id;
ALTER TABLE public.races DROP COLUMN IF EXISTS is_unknown;

-- Keep the canonical unknown gender accepted on rollback. Re-mapping unknown persons to a
-- guessed biological sex would be destructive, so this compatibility remains intentionally.

COMMIT;
