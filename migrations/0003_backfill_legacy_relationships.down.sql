BEGIN;

DELETE FROM public.relationships
WHERE metadata->>'legacy_source' IN ('parent_child_relationships','romantic_relationships');

COMMIT;
