BEGIN;

DROP TRIGGER IF EXISTS trg_family_tree_members_project_scope ON public.family_tree_members;
DROP TRIGGER IF EXISTS trg_family_trees_project_scope ON public.family_trees;
DROP FUNCTION IF EXISTS public.worldreborn_validate_family_tree_member_scope();
DROP FUNCTION IF EXISTS public.worldreborn_validate_family_tree_scope();

DROP INDEX IF EXISTS public.family_tree_members_tree_page_idx;
DROP INDEX IF EXISTS public.family_trees_project_page_idx;
DROP INDEX IF EXISTS public.group_memberships_group_page_idx;
DROP INDEX IF EXISTS public.relationships_project_type_page_idx;
DROP INDEX IF EXISTS public.relationships_project_page_idx;
DROP INDEX IF EXISTS public.groups_project_name_page_idx;
DROP INDEX IF EXISTS public.npcs_project_name_page_idx;

DROP TABLE IF EXISTS public.family_tree_members;
DROP TABLE IF EXISTS public.family_trees;

DELETE FROM public.relationship_types rt
WHERE rt.code IN ('adoptive_parent','step_parent','guardian','twin','engaged','widowed_from')
  AND NOT EXISTS (
    SELECT 1 FROM public.relationships r
    WHERE r.relationship_type_id = rt.relationship_type_id
  );

ALTER TABLE public.group_memberships
  DROP COLUMN IF EXISTS is_leader,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS rank;

ALTER TABLE public.groups
  DROP CONSTRAINT IF EXISTS groups_parent_group_id_fkey,
  DROP COLUMN IF EXISTS dissolved_display,
  DROP COLUMN IF EXISTS founded_display,
  DROP COLUMN IF EXISTS parent_group_id;

COMMIT;
