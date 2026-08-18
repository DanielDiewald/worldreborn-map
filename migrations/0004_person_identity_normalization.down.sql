BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

ALTER TABLE public.map_markers DROP CONSTRAINT IF EXISTS map_markers_entity_pair_check;
ALTER TABLE public.map_markers DROP CONSTRAINT IF EXISTS map_markers_coordinate_values_check;
ALTER TABLE public.map_markers DROP CONSTRAINT IF EXISTS map_markers_project_map_fk;
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_project_location_fk;
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_project_location_fk;
DROP INDEX IF EXISTS public.project_maps_project_map_uidx;
DROP INDEX IF EXISTS public.groups_camp_group_uidx;
DROP INDEX IF EXISTS public.locations_camp_loc_uidx;

-- Restore the relationship type/status behavior that existed immediately before 0004.
UPDATE public.relationships r
SET relationship_type_id=rt.relationship_type_id,
    status=CASE WHEN COALESCE((r.metadata->>'divorced')::boolean,false) THEN 'ended' ELSE 'active' END,
    updated_at=now()
FROM public.relationship_types rt
WHERE r.metadata->>'legacy_source'='romantic_relationships'
  AND rt.code=CASE WHEN COALESCE((r.metadata->>'marriage')::boolean,false) THEN 'spouse' ELSE 'romantic' END;

-- Restore every generic person reference from the durable mapping log.
UPDATE public.entity_visibility x SET entity_type=l.old_type,entity_id=l.old_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='entity_visibility' AND l.row_id=x.visibility_id;

UPDATE public.player_entity_variants x SET entity_type=l.old_type,entity_id=l.old_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='player_entity_variants' AND l.row_id=x.variant_id;

UPDATE public.entity_tags x SET entity_type=l.old_type,entity_id=l.old_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='entity_tags' AND l.row_id=x.entity_tag_id;

UPDATE public.timeline_links x SET entity_type=l.old_type,entity_id=l.old_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='timeline_links' AND l.row_id=x.timeline_link_id;

UPDATE public.map_markers x SET entity_type=l.old_type,entity_id=l.old_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='map_markers' AND l.row_id=x.marker_id;

UPDATE public.media x SET entity_type=l.old_type,entity_id=l.old_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='media' AND l.row_id=x.media_id;

UPDATE public.group_memberships x SET entity_type=l.old_type,entity_id=l.old_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='group_memberships' AND l.row_id=x.membership_id;

UPDATE public.relationships x SET entity_a_type=l.old_type,entity_a_id=l.old_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='relationships' AND l.endpoint='entity_a' AND l.row_id=x.relationship_id;

UPDATE public.relationships x SET entity_b_type=l.old_type,entity_b_id=l.old_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='relationships' AND l.endpoint='entity_b' AND l.row_id=x.relationship_id;

-- Remove only memberships created from the legacy adapter that did not exist before 0004.
DELETE FROM public.group_memberships gm
WHERE gm.metadata->>'legacy_source'='is_part_of'
  AND NOT EXISTS (
    SELECT 1 FROM public.person_reference_migration_log l
    WHERE l.migration_key='0004' AND l.table_name='group_memberships' AND l.row_id=gm.membership_id
  );

DROP TRIGGER IF EXISTS chars_character_subtype ON public.chars;
DROP FUNCTION IF EXISTS public.check_player_character_subtype();
DROP TRIGGER IF EXISTS person_subtype_xor_gods ON public.gods;
DROP TRIGGER IF EXISTS person_subtype_xor_charakters ON public.charakters;
DROP TRIGGER IF EXISTS person_subtype_xor_npcs ON public.npcs;
DROP FUNCTION IF EXISTS public.check_person_subtype_xor();

ALTER TABLE public.chars DROP CONSTRAINT IF EXISTS chars_n_id_unique;
ALTER TABLE public.chars DROP CONSTRAINT IF EXISTS chars_user_id_unique;
ALTER TABLE public.is_part_of DROP CONSTRAINT IF EXISTS is_part_of_gr_id_char_id_unique;
ALTER TABLE public.gods DROP CONSTRAINT IF EXISTS gods_n_id_unique;
ALTER TABLE public.charakters DROP CONSTRAINT IF EXISTS charakters_n_id_unique;

DELETE FROM public.person_reference_migration_log WHERE migration_key='0004';
DROP TABLE IF EXISTS public.person_reference_migration_log;

COMMIT;
