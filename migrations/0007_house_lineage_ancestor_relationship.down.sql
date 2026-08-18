BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Remove the type only when 0007 created it and no user relationship references it.
-- Referenced data always wins over a destructive rollback.
DELETE FROM public.relationship_types rt
WHERE rt.code='ancestor'
  AND COALESCE((SELECT NOT existed_before FROM public.worldreborn_0007_object_state WHERE object_key='relationship_type_ancestor'), false)
  AND NOT EXISTS (
    SELECT 1 FROM public.relationships r WHERE r.relationship_type_id=rt.relationship_type_id
  );

DELETE FROM public.worldreborn_0007_object_state WHERE object_key='relationship_type_ancestor';

DO $$
BEGIN
  IF to_regclass('public.worldreborn_0007_object_state') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.worldreborn_0007_object_state) THEN
    DROP TABLE public.worldreborn_0007_object_state;
  END IF;
END
$$;

COMMIT;
