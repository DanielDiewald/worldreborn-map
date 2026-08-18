BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.worldreborn_0005_object_state') IS NULL THEN
    RAISE EXCEPTION '0005 rollback state is missing; refusing a potentially destructive rollback';
  END IF;
END
$guard$;

-- Remove triggers created by 0005. Existing triggers are intentionally preserved.
DO $rollback$
BEGIN
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='trigger_group_parent_project'),false) THEN
    DROP TRIGGER IF EXISTS groups_parent_project_guard ON public.groups;
  END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='trigger_is_part_of_sync'),false) THEN
    DROP TRIGGER IF EXISTS is_part_of_sync_group_memberships ON public.is_part_of;
  END IF;

  -- If these functions did not exist, their guard triggers could not have existed either.
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='fn_family_root_project'),false)
     AND to_regclass('public.family_trees') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS family_tree_root_project_guard ON public.family_trees;
  END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='fn_family_member_project'),false)
     AND to_regclass('public.family_tree_members') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS family_tree_member_project_guard ON public.family_tree_members;
  END IF;
END
$rollback$;

-- Drop functions only when 0005 created them.
DO $rollback$
BEGIN
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='fn_group_parent_project'),false) THEN
    DROP FUNCTION IF EXISTS public.check_group_parent_project();
  END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='fn_sync_is_part_of'),false) THEN
    DROP FUNCTION IF EXISTS public.sync_is_part_of_to_group_memberships();
  END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='fn_upsert_membership'),false) THEN
    DROP FUNCTION IF EXISTS public.upsert_person_group_membership(integer,integer,integer,text,text,character varying,boolean,text,text,text);
  END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='fn_delete_membership'),false) THEN
    DROP FUNCTION IF EXISTS public.delete_person_group_membership(integer,integer,integer);
  END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='fn_family_root_project'),false) THEN
    DROP FUNCTION IF EXISTS public.check_family_tree_root_project();
  END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='fn_family_member_project'),false) THEN
    DROP FUNCTION IF EXISTS public.check_family_tree_member_project();
  END IF;
END
$rollback$;

-- Remove only indexes introduced by 0005.
DO $rollback$
BEGIN
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='index_family_tree_members_person'),false) THEN DROP INDEX IF EXISTS public.family_tree_members_person_idx; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='index_family_tree_members_page'),false) THEN DROP INDEX IF EXISTS public.family_tree_members_tree_page_idx; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='index_family_trees_page'),false) THEN DROP INDEX IF EXISTS public.family_trees_project_page_idx; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='index_group_memberships_page'),false) THEN DROP INDEX IF EXISTS public.group_memberships_group_page_idx; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='index_relationships_type_page'),false) THEN DROP INDEX IF EXISTS public.relationships_project_type_page_idx; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='index_relationships_page'),false) THEN DROP INDEX IF EXISTS public.relationships_project_page_idx; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='index_groups_page'),false) THEN DROP INDEX IF EXISTS public.groups_project_name_page_idx; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='index_npcs_page'),false) THEN DROP INDEX IF EXISTS public.npcs_project_name_page_idx; END IF;
END
$rollback$;

-- Delete only family relationship types inserted by 0005 and only when unused.
DELETE FROM public.relationship_types rt
WHERE rt.code IN ('adoptive_parent','step_parent','guardian','twin','engaged','widowed_from')
  AND NOT COALESCE((SELECT s.existed_before FROM public.worldreborn_0005_object_state s WHERE s.object_key='relationship_type_'||rt.code),false)
  AND NOT EXISTS (SELECT 1 FROM public.relationships r WHERE r.relationship_type_id=rt.relationship_type_id);

-- Named tree tables are dropped only if they did not exist before 0005.
DO $rollback$
BEGIN
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='family_tree_members_table'),false) THEN
    DROP TABLE IF EXISTS public.family_tree_members;
  END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='family_trees_table'),false) THEN
    DROP TABLE IF EXISTS public.family_trees;
  END IF;
END
$rollback$;

-- Remove constraints and columns only when 0005 introduced them.
DO $rollback$
BEGIN
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='constraint_groups_parent_fk'),false) THEN
    ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_parent_group_id_fkey;
  END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='constraint_groups_parent_not_self'),false) THEN
    ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_parent_not_self_check;
  END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='constraint_gm_status'),false) THEN
    ALTER TABLE public.group_memberships DROP CONSTRAINT IF EXISTS group_memberships_status_check;
  END IF;

  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='gm_updated_at'),false) THEN ALTER TABLE public.group_memberships DROP COLUMN IF EXISTS updated_at; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='gm_notes'),false) THEN ALTER TABLE public.group_memberships DROP COLUMN IF EXISTS notes; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='gm_is_leader'),false) THEN ALTER TABLE public.group_memberships DROP COLUMN IF EXISTS is_leader; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='gm_membership_status'),false) THEN ALTER TABLE public.group_memberships DROP COLUMN IF EXISTS membership_status; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='gm_rank_label'),false) THEN ALTER TABLE public.group_memberships DROP COLUMN IF EXISTS rank_label; END IF;

  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='groups_dissolved_display'),false) THEN ALTER TABLE public.groups DROP COLUMN IF EXISTS dissolved_display; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='groups_founded_display'),false) THEN ALTER TABLE public.groups DROP COLUMN IF EXISTS founded_display; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='groups_parent_group_id'),false) THEN ALTER TABLE public.groups DROP COLUMN IF EXISTS parent_group_id; END IF;
  IF NOT COALESCE((SELECT existed_before FROM public.worldreborn_0005_object_state WHERE object_key='groups_public_description'),false) THEN ALTER TABLE public.groups DROP COLUMN IF EXISTS public_description; END IF;
END
$rollback$;

DROP TABLE public.worldreborn_0005_object_state;

COMMIT;
