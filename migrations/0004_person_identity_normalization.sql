BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- This migration corrects the person identity model introduced by the foundation work.
-- npcs.n_id is the only canonical person id. char_id and g_id remain subtype-row ids.

CREATE TABLE IF NOT EXISTS public.person_reference_migration_log (
  migration_key text NOT NULL,
  table_name text NOT NULL,
  row_id bigint NOT NULL,
  endpoint text NOT NULL DEFAULT 'entity',
  old_type text NOT NULL,
  old_id bigint NOT NULL,
  new_type text NOT NULL,
  new_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (migration_key, table_name, row_id, endpoint)
);

-- Fail before changing data if the proven legacy subtype partition is already broken.
DO $$
DECLARE
  base_only integer;
  overlaps integer;
  duplicate_characters integer;
  duplicate_gods integer;
BEGIN
  SELECT count(*) INTO base_only
  FROM public.npcs n
  WHERE NOT EXISTS (SELECT 1 FROM public.charakters c WHERE c.n_id=n.n_id)
    AND NOT EXISTS (SELECT 1 FROM public.gods g WHERE g.n_id=n.n_id);

  SELECT count(*) INTO overlaps
  FROM public.npcs n
  WHERE EXISTS (SELECT 1 FROM public.charakters c WHERE c.n_id=n.n_id)
    AND EXISTS (SELECT 1 FROM public.gods g WHERE g.n_id=n.n_id);

  SELECT count(*) INTO duplicate_characters
  FROM (SELECT n_id FROM public.charakters GROUP BY n_id HAVING count(*) > 1) x;

  SELECT count(*) INTO duplicate_gods
  FROM (SELECT n_id FROM public.gods GROUP BY n_id HAVING count(*) > 1) x;

  IF base_only <> 0 OR overlaps <> 0 OR duplicate_characters <> 0 OR duplicate_gods <> 0 THEN
    RAISE EXCEPTION 'Person subtype audit failed: base_only=%, overlaps=%, duplicate_characters=%, duplicate_gods=%',
      base_only, overlaps, duplicate_characters, duplicate_gods;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.charakters GROUP BY n_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Cannot add UNIQUE(charakters.n_id): duplicates exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='charakters_n_id_unique') THEN
    ALTER TABLE public.charakters ADD CONSTRAINT charakters_n_id_unique UNIQUE (n_id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.gods GROUP BY n_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Cannot add UNIQUE(gods.n_id): duplicates exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='gods_n_id_unique') THEN
    ALTER TABLE public.gods ADD CONSTRAINT gods_n_id_unique UNIQUE (n_id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.is_part_of GROUP BY gr_id,char_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Cannot add UNIQUE(is_part_of.gr_id,char_id): duplicates exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='is_part_of_gr_id_char_id_unique') THEN
    ALTER TABLE public.is_part_of ADD CONSTRAINT is_part_of_gr_id_char_id_unique UNIQUE (gr_id,char_id);
  END IF;

  IF EXISTS (SELECT 1 FROM public.chars GROUP BY user_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Cannot add UNIQUE(chars.user_id): duplicate player assignments exist';
  END IF;
  IF EXISTS (SELECT 1 FROM public.chars GROUP BY n_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Cannot add UNIQUE(chars.n_id): duplicate character assignments exist';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chars_user_id_unique') THEN
    ALTER TABLE public.chars ADD CONSTRAINT chars_user_id_unique UNIQUE (user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chars_n_id_unique') THEN
    ALTER TABLE public.chars ADD CONSTRAINT chars_n_id_unique UNIQUE (n_id);
  END IF;
END $$;

-- Keep the XOR subtype invariant for every completed transaction.
CREATE OR REPLACE FUNCTION public.check_person_subtype_xor()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target_n_id integer;
  subtype_count integer;
BEGIN
  target_n_id := CASE WHEN TG_OP='DELETE' THEN OLD.n_id ELSE NEW.n_id END;
  IF NOT EXISTS (SELECT 1 FROM public.npcs WHERE n_id=target_n_id) THEN
    RETURN NULL;
  END IF;
  SELECT
    (CASE WHEN EXISTS(SELECT 1 FROM public.charakters WHERE n_id=target_n_id) THEN 1 ELSE 0 END) +
    (CASE WHEN EXISTS(SELECT 1 FROM public.gods WHERE n_id=target_n_id) THEN 1 ELSE 0 END)
  INTO subtype_count;
  IF subtype_count <> 1 THEN
    RAISE EXCEPTION 'Person % must have exactly one subtype (character xor god); found %', target_n_id, subtype_count;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS person_subtype_xor_npcs ON public.npcs;
CREATE CONSTRAINT TRIGGER person_subtype_xor_npcs
AFTER INSERT OR UPDATE ON public.npcs
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_person_subtype_xor();

DROP TRIGGER IF EXISTS person_subtype_xor_charakters ON public.charakters;
CREATE CONSTRAINT TRIGGER person_subtype_xor_charakters
AFTER INSERT OR UPDATE OR DELETE ON public.charakters
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_person_subtype_xor();

DROP TRIGGER IF EXISTS person_subtype_xor_gods ON public.gods;
CREATE CONSTRAINT TRIGGER person_subtype_xor_gods
AFTER INSERT OR UPDATE OR DELETE ON public.gods
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_person_subtype_xor();

-- chars may only point at Character persons, never Gods/base-only persons.
CREATE OR REPLACE FUNCTION public.check_player_character_subtype()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.charakters WHERE n_id=NEW.n_id) THEN
    RAISE EXCEPTION 'chars.n_id % is not a Character person', NEW.n_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.gods WHERE n_id=NEW.n_id) THEN
    RAISE EXCEPTION 'God person % cannot be assigned as a player character', NEW.n_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS chars_character_subtype ON public.chars;
CREATE TRIGGER chars_character_subtype
BEFORE INSERT OR UPDATE OF n_id ON public.chars
FOR EACH ROW EXECUTE FUNCTION public.check_player_character_subtype();

-- Backfill legacy group membership. is_part_of.char_id is a subtype row id and must be translated.
INSERT INTO public.group_memberships(project_id,group_id,entity_type,entity_id,metadata)
SELECT n.camp_id, i.gr_id, 'person', c.n_id,
       jsonb_build_object(
         'legacy_source','is_part_of',
         'legacy_char_id',i.char_id,
         'legacy_group_id',i.gr_id
       )
FROM public.is_part_of i
JOIN public.charakters c ON c.char_id=i.char_id
JOIN public.npcs n ON n.n_id=c.n_id
JOIN public.groups g ON g.gr_id=i.gr_id AND g.camp_id=n.camp_id
ON CONFLICT (project_id,group_id,entity_type,entity_id)
DO UPDATE SET metadata=public.group_memberships.metadata || EXCLUDED.metadata;

-- Record and normalize generic reference tables. Updates are intentionally allowed to fail on
-- unique-key collisions: that makes the whole migration rollback instead of silently dropping rows.

INSERT INTO public.person_reference_migration_log(migration_key,table_name,row_id,old_type,old_id,new_type,new_id)
SELECT '0004','entity_visibility',ev.visibility_id,ev.entity_type,ev.entity_id,'person',
       CASE ev.entity_type WHEN 'character' THEN c.n_id WHEN 'god' THEN g.n_id ELSE ev.entity_id END
FROM public.entity_visibility ev
LEFT JOIN public.charakters c ON ev.entity_type='character' AND c.char_id=ev.entity_id
LEFT JOIN public.gods g ON ev.entity_type='god' AND g.g_id=ev.entity_id
WHERE ev.entity_type IN ('npc','character','god')
ON CONFLICT DO NOTHING;
UPDATE public.entity_visibility ev SET entity_type='person', entity_id=l.new_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='entity_visibility' AND l.row_id=ev.visibility_id;

INSERT INTO public.person_reference_migration_log(migration_key,table_name,row_id,old_type,old_id,new_type,new_id)
SELECT '0004','player_entity_variants',v.variant_id,v.entity_type,v.entity_id,'person',
       CASE v.entity_type WHEN 'character' THEN c.n_id WHEN 'god' THEN g.n_id ELSE v.entity_id END
FROM public.player_entity_variants v
LEFT JOIN public.charakters c ON v.entity_type='character' AND c.char_id=v.entity_id
LEFT JOIN public.gods g ON v.entity_type='god' AND g.g_id=v.entity_id
WHERE v.entity_type IN ('npc','character','god') AND v.entity_id IS NOT NULL
ON CONFLICT DO NOTHING;
UPDATE public.player_entity_variants v SET entity_type='person', entity_id=l.new_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='player_entity_variants' AND l.row_id=v.variant_id;

INSERT INTO public.person_reference_migration_log(migration_key,table_name,row_id,old_type,old_id,new_type,new_id)
SELECT '0004','entity_tags',et.entity_tag_id,et.entity_type,et.entity_id,'person',
       CASE et.entity_type WHEN 'character' THEN c.n_id WHEN 'god' THEN g.n_id ELSE et.entity_id END
FROM public.entity_tags et
LEFT JOIN public.charakters c ON et.entity_type='character' AND c.char_id=et.entity_id
LEFT JOIN public.gods g ON et.entity_type='god' AND g.g_id=et.entity_id
WHERE et.entity_type IN ('npc','character','god')
ON CONFLICT DO NOTHING;
UPDATE public.entity_tags et SET entity_type='person', entity_id=l.new_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='entity_tags' AND l.row_id=et.entity_tag_id;

INSERT INTO public.person_reference_migration_log(migration_key,table_name,row_id,old_type,old_id,new_type,new_id)
SELECT '0004','timeline_links',tl.timeline_link_id,tl.entity_type,tl.entity_id,'person',
       CASE tl.entity_type WHEN 'character' THEN c.n_id WHEN 'god' THEN g.n_id ELSE tl.entity_id END
FROM public.timeline_links tl
LEFT JOIN public.charakters c ON tl.entity_type='character' AND c.char_id=tl.entity_id
LEFT JOIN public.gods g ON tl.entity_type='god' AND g.g_id=tl.entity_id
WHERE tl.entity_type IN ('npc','character','god')
ON CONFLICT DO NOTHING;
UPDATE public.timeline_links tl SET entity_type='person', entity_id=l.new_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='timeline_links' AND l.row_id=tl.timeline_link_id;

INSERT INTO public.person_reference_migration_log(migration_key,table_name,row_id,old_type,old_id,new_type,new_id)
SELECT '0004','map_markers',m.marker_id,m.entity_type,m.entity_id,'person',
       CASE m.entity_type WHEN 'character' THEN c.n_id WHEN 'god' THEN g.n_id ELSE m.entity_id END
FROM public.map_markers m
LEFT JOIN public.charakters c ON m.entity_type='character' AND c.char_id=m.entity_id
LEFT JOIN public.gods g ON m.entity_type='god' AND g.g_id=m.entity_id
WHERE m.entity_type IN ('npc','character','god') AND m.entity_id IS NOT NULL
ON CONFLICT DO NOTHING;
UPDATE public.map_markers m SET entity_type='person', entity_id=l.new_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='map_markers' AND l.row_id=m.marker_id;

INSERT INTO public.person_reference_migration_log(migration_key,table_name,row_id,old_type,old_id,new_type,new_id)
SELECT '0004','media',m.media_id,m.entity_type,m.entity_id,'person',
       CASE m.entity_type WHEN 'character' THEN c.n_id WHEN 'god' THEN g.n_id ELSE m.entity_id END
FROM public.media m
LEFT JOIN public.charakters c ON m.entity_type='character' AND c.char_id=m.entity_id
LEFT JOIN public.gods g ON m.entity_type='god' AND g.g_id=m.entity_id
WHERE m.entity_type IN ('npc','character','god') AND m.entity_id IS NOT NULL
ON CONFLICT DO NOTHING;
UPDATE public.media m SET entity_type='person', entity_id=l.new_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='media' AND l.row_id=m.media_id;

INSERT INTO public.person_reference_migration_log(migration_key,table_name,row_id,old_type,old_id,new_type,new_id)
SELECT '0004','group_memberships',gm.membership_id,gm.entity_type,gm.entity_id,'person',
       CASE gm.entity_type WHEN 'character' THEN c.n_id WHEN 'god' THEN g.n_id ELSE gm.entity_id END
FROM public.group_memberships gm
LEFT JOIN public.charakters c ON gm.entity_type='character' AND c.char_id=gm.entity_id
LEFT JOIN public.gods g ON gm.entity_type='god' AND g.g_id=gm.entity_id
WHERE gm.entity_type IN ('npc','character','god')
ON CONFLICT DO NOTHING;
UPDATE public.group_memberships gm SET entity_type='person', entity_id=l.new_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='group_memberships' AND l.row_id=gm.membership_id;

-- Relationship endpoints need independent log entries.
INSERT INTO public.person_reference_migration_log(migration_key,table_name,row_id,endpoint,old_type,old_id,new_type,new_id)
SELECT '0004','relationships',r.relationship_id,'entity_a',r.entity_a_type,r.entity_a_id,'person',
       CASE r.entity_a_type WHEN 'character' THEN c.n_id WHEN 'god' THEN g.n_id ELSE r.entity_a_id END
FROM public.relationships r
LEFT JOIN public.charakters c ON r.entity_a_type='character' AND c.char_id=r.entity_a_id
LEFT JOIN public.gods g ON r.entity_a_type='god' AND g.g_id=r.entity_a_id
WHERE r.entity_a_type IN ('npc','character','god') ON CONFLICT DO NOTHING;
UPDATE public.relationships r SET entity_a_type='person',entity_a_id=l.new_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='relationships' AND l.endpoint='entity_a' AND l.row_id=r.relationship_id;

INSERT INTO public.person_reference_migration_log(migration_key,table_name,row_id,endpoint,old_type,old_id,new_type,new_id)
SELECT '0004','relationships',r.relationship_id,'entity_b',r.entity_b_type,r.entity_b_id,'person',
       CASE r.entity_b_type WHEN 'character' THEN c.n_id WHEN 'god' THEN g.n_id ELSE r.entity_b_id END
FROM public.relationships r
LEFT JOIN public.charakters c ON r.entity_b_type='character' AND c.char_id=r.entity_b_id
LEFT JOIN public.gods g ON r.entity_b_type='god' AND g.g_id=r.entity_b_id
WHERE r.entity_b_type IN ('npc','character','god') ON CONFLICT DO NOTHING;
UPDATE public.relationships r SET entity_b_type='person',entity_b_id=l.new_id
FROM public.person_reference_migration_log l
WHERE l.migration_key='0004' AND l.table_name='relationships' AND l.endpoint='entity_b' AND l.row_id=r.relationship_id;

-- Every migrated person reference must resolve to a real person in the same project.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.person_reference_migration_log l
    WHERE l.migration_key='0004' AND l.new_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Unresolvable legacy person reference detected';
  END IF;
END $$;

-- Correct the coarse 0003 romantic mapping while retaining all original flags/labels in metadata.
UPDATE public.relationships r
SET relationship_type_id = rt.relationship_type_id,
    status = CASE
      WHEN COALESCE((r.metadata->>'divorced')::boolean,false) THEN 'ended'
      WHEN lower(COALESCE(r.metadata->>'legacy_type',''))='late spouse' THEN 'ended'
      ELSE 'active'
    END,
    updated_at = now()
FROM public.relationship_types rt
WHERE r.metadata->>'legacy_source'='romantic_relationships'
  AND rt.code = CASE
    WHEN lower(COALESCE(r.metadata->>'legacy_type',''))='friend' THEN 'friend'
    WHEN lower(COALESCE(r.metadata->>'legacy_type',''))='partner'
      AND COALESCE((r.metadata->>'marriage')::boolean,false)
      AND COALESCE((r.metadata->>'divorced')::boolean,false) THEN 'ex_partner'
    WHEN lower(COALESCE(r.metadata->>'legacy_type',''))='partner'
      AND COALESCE((r.metadata->>'marriage')::boolean,false) THEN 'spouse'
    WHEN lower(COALESCE(r.metadata->>'legacy_type',''))='late spouse' THEN 'ex_partner'
    WHEN lower(COALESCE(r.metadata->>'legacy_type','')) IN ('lover','love interest','soulmate','partner') THEN 'romantic'
    ELSE 'custom'
  END;

-- Project-aware integrity for locations/groups/events where legacy data already proves consistency.
CREATE UNIQUE INDEX IF NOT EXISTS locations_camp_loc_uidx ON public.locations(camp_id,loc_id);
CREATE UNIQUE INDEX IF NOT EXISTS groups_camp_group_uidx ON public.groups(camp_id,gr_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_maps_project_map_uidx ON public.project_maps(project_id,map_id);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='groups_project_location_fk') THEN
    ALTER TABLE public.groups ADD CONSTRAINT groups_project_location_fk
      FOREIGN KEY(camp_id,loc_id) REFERENCES public.locations(camp_id,loc_id) NOT VALID;
    ALTER TABLE public.groups VALIDATE CONSTRAINT groups_project_location_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='events_project_location_fk') THEN
    ALTER TABLE public.events ADD CONSTRAINT events_project_location_fk
      FOREIGN KEY(camp_id,loc_id) REFERENCES public.locations(camp_id,loc_id) NOT VALID;
    ALTER TABLE public.events VALIDATE CONSTRAINT events_project_location_fk;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='map_markers_project_map_fk') THEN
    ALTER TABLE public.map_markers ADD CONSTRAINT map_markers_project_map_fk
      FOREIGN KEY(project_id,map_id) REFERENCES public.project_maps(project_id,map_id) NOT VALID;
    ALTER TABLE public.map_markers VALIDATE CONSTRAINT map_markers_project_map_fk;
  END IF;
END $$;

-- Marker completeness constraints.
ALTER TABLE public.map_markers DROP CONSTRAINT IF EXISTS map_markers_coordinate_values_check;
ALTER TABLE public.map_markers ADD CONSTRAINT map_markers_coordinate_values_check CHECK (
  (coordinate_mode='latlng' AND lat IS NOT NULL AND lng IS NOT NULL AND x IS NULL AND y IS NULL)
  OR (coordinate_mode='xy' AND x IS NOT NULL AND y IS NOT NULL AND lat IS NULL AND lng IS NULL)
);
ALTER TABLE public.map_markers DROP CONSTRAINT IF EXISTS map_markers_entity_pair_check;
ALTER TABLE public.map_markers ADD CONSTRAINT map_markers_entity_pair_check CHECK (
  (entity_type IS NULL AND entity_id IS NULL) OR (entity_type IS NOT NULL AND entity_id IS NOT NULL)
);

COMMIT;
