BEGIN;

-- Remove indexes that this migration added to legacy tables.
DROP INDEX IF EXISTS public.romantic_partner2_idx;
DROP INDEX IF EXISTS public.romantic_partner1_idx;
DROP INDEX IF EXISTS public.parent_child_child_idx;
DROP INDEX IF EXISTS public.parent_child_parent_idx;
DROP INDEX IF EXISTS public.is_part_of_character_idx;
DROP INDEX IF EXISTS public.is_part_of_group_idx;
DROP INDEX IF EXISTS public.events_loc_id_idx;
DROP INDEX IF EXISTS public.events_camp_id_idx;
DROP INDEX IF EXISTS public.chars_user_id_idx;
DROP INDEX IF EXISTS public.chars_n_id_idx;
DROP INDEX IF EXISTS public.gods_n_id_idx;
DROP INDEX IF EXISTS public.charakters_loc_id_idx;
DROP INDEX IF EXISTS public.charakters_n_id_idx;
DROP INDEX IF EXISTS public.groups_loc_id_idx;
DROP INDEX IF EXISTS public.groups_camp_id_idx;
DROP INDEX IF EXISTS public.locations_parent_loc_id_idx;
DROP INDEX IF EXISTS public.locations_camp_id_idx;
DROP INDEX IF EXISTS public.npcs_camp_id_idx;

DROP TABLE IF EXISTS public.audit_log;
DROP TABLE IF EXISTS public.timeline_links;
DROP TABLE IF EXISTS public.entity_tags;
DROP TABLE IF EXISTS public.tags;
DROP TABLE IF EXISTS public.group_memberships;
DROP TABLE IF EXISTS public.relationships;
DROP TABLE IF EXISTS public.relationship_types;
DROP TABLE IF EXISTS public.player_entity_variants;
DROP TABLE IF EXISTS public.player_access_codes;
DROP TABLE IF EXISTS public.entity_visibility;
DROP TABLE IF EXISTS public.media;
DROP TABLE IF EXISTS public.map_markers;

ALTER TABLE public.campaigns
  DROP COLUMN IF EXISTS primary_map_id;

DROP TABLE IF EXISTS public.project_maps;
DROP TABLE IF EXISTS public.player_sessions;
DROP TABLE IF EXISTS public.admin_sessions;
DROP TABLE IF EXISTS public.auth_rate_limits;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS active,
  DROP COLUMN IF EXISTS display_name,
  DROP COLUMN IF EXISTS camp_id;

ALTER TABLE public.events
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS visibility_mode,
  DROP COLUMN IF EXISTS importance,
  DROP COLUMN IF EXISTS category,
  DROP COLUMN IF EXISTS fantasy_day,
  DROP COLUMN IF EXISTS fantasy_month,
  DROP COLUMN IF EXISTS fantasy_year,
  DROP COLUMN IF EXISTS era,
  DROP COLUMN IF EXISTS sort_value,
  DROP COLUMN IF EXISTS display_date,
  DROP COLUMN IF EXISTS camp_id;

ALTER TABLE public.groups
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS visibility_mode,
  DROP COLUMN IF EXISTS group_type;

ALTER TABLE public.locations
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS visibility_mode,
  DROP COLUMN IF EXISTS population,
  DROP COLUMN IF EXISTS owner_n_id,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS location_type,
  DROP COLUMN IF EXISTS parent_loc_id;

ALTER TABLE public.npcs
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS visibility_mode,
  DROP COLUMN IF EXISTS profession,
  DROP COLUMN IF EXISTS species,
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS admin_notes,
  DROP COLUMN IF EXISTS public_description;

ALTER TABLE public.campaigns
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS created_at,
  DROP COLUMN IF EXISTS in_world_date,
  DROP COLUMN IF EXISTS settings,
  DROP COLUMN IF EXISTS status;

COMMIT;
