BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Additive group metadata. Legacy columns and rows remain untouched.
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS parent_group_id integer,
  ADD COLUMN IF NOT EXISTS founded_display text,
  ADD COLUMN IF NOT EXISTS dissolved_display text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'groups_parent_group_id_fkey'
      AND conrelid = 'public.groups'::regclass
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_parent_group_id_fkey
      FOREIGN KEY (parent_group_id) REFERENCES public.groups(gr_id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.group_memberships
  ADD COLUMN IF NOT EXISTS rank text,
  ADD COLUMN IF NOT EXISTS status character varying(30) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_leader boolean NOT NULL DEFAULT false;

-- Keep legacy is_part_of and modern group_memberships synchronized without trigger loops.
-- Character membership: both tables. God membership: group_memberships only (Gods have no char_id).
CREATE OR REPLACE FUNCTION public.worldreborn_sync_is_part_of_to_membership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_id integer;
  v_person_id integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    SELECT n.camp_id, c.n_id INTO v_project_id, v_person_id
    FROM public.charakters c
    JOIN public.npcs n ON n.n_id=c.n_id
    JOIN public.groups g ON g.gr_id=OLD.gr_id AND g.camp_id=n.camp_id
    WHERE c.char_id=OLD.char_id;

    IF v_project_id IS NOT NULL THEN
      DELETE FROM public.group_memberships gm
      WHERE gm.project_id=v_project_id
        AND gm.group_id=OLD.gr_id
        AND gm.entity_type='person'
        AND gm.entity_id=v_person_id;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_project_id := NULL;
    v_person_id := NULL;

    SELECT n.camp_id, c.n_id INTO v_project_id, v_person_id
    FROM public.charakters c
    JOIN public.npcs n ON n.n_id=c.n_id
    JOIN public.groups g ON g.gr_id=NEW.gr_id AND g.camp_id=n.camp_id
    WHERE c.char_id=NEW.char_id;

    IF v_project_id IS NULL THEN
      RAISE EXCEPTION 'is_part_of reference does not resolve to a Character and Group in the same project';
    END IF;

    INSERT INTO public.group_memberships(project_id,group_id,entity_type,entity_id,metadata)
    VALUES(
      v_project_id,
      NEW.gr_id,
      'person',
      v_person_id,
      jsonb_build_object('legacy_source','is_part_of','legacy_char_id',NEW.char_id,'legacy_group_id',NEW.gr_id)
    )
    ON CONFLICT(project_id,group_id,entity_type,entity_id)
    DO UPDATE SET metadata=public.group_memberships.metadata || EXCLUDED.metadata;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_is_part_of_membership_sync ON public.is_part_of;
CREATE TRIGGER trg_is_part_of_membership_sync
AFTER INSERT OR UPDATE OR DELETE ON public.is_part_of
FOR EACH ROW EXECUTE FUNCTION public.worldreborn_sync_is_part_of_to_membership();

CREATE OR REPLACE FUNCTION public.worldreborn_sync_membership_to_is_part_of()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_char_id integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD.entity_type='person' THEN
    SELECT c.char_id INTO v_char_id
    FROM public.charakters c
    JOIN public.npcs n ON n.n_id=c.n_id
    WHERE c.n_id=OLD.entity_id AND n.camp_id=OLD.project_id;

    IF v_char_id IS NOT NULL THEN
      DELETE FROM public.is_part_of
      WHERE gr_id=OLD.group_id AND char_id=v_char_id;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.entity_type='person' THEN
    v_char_id := NULL;
    SELECT c.char_id INTO v_char_id
    FROM public.charakters c
    JOIN public.npcs n ON n.n_id=c.n_id
    JOIN public.groups g ON g.gr_id=NEW.group_id AND g.camp_id=NEW.project_id
    WHERE c.n_id=NEW.entity_id AND n.camp_id=NEW.project_id;

    IF v_char_id IS NOT NULL THEN
      INSERT INTO public.is_part_of(gr_id,char_id)
      VALUES(NEW.group_id,v_char_id)
      ON CONFLICT(gr_id,char_id) DO NOTHING;
    ELSIF EXISTS(
      SELECT 1 FROM public.gods gd
      JOIN public.npcs n ON n.n_id=gd.n_id
      WHERE gd.n_id=NEW.entity_id AND n.camp_id=NEW.project_id
    ) THEN
      NULL; -- Gods intentionally have no is_part_of shadow row.
    ELSE
      RAISE EXCEPTION 'Person membership does not resolve to a Character or God in the same project';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_membership_legacy_sync ON public.group_memberships;
CREATE TRIGGER trg_group_membership_legacy_sync
AFTER INSERT OR UPDATE OR DELETE ON public.group_memberships
FOR EACH ROW EXECUTE FUNCTION public.worldreborn_sync_membership_to_is_part_of();

-- Named family trees reference canonical persons by npcs.n_id. Relationships stay canonical in relationships.
CREATE TABLE IF NOT EXISTS public.family_trees (
  tree_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  name character varying(160),
  subtitle character varying(240),
  description text,
  root_person_id integer REFERENCES public.npcs(n_id) ON UPDATE CASCADE ON DELETE SET NULL,
  visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT family_trees_visibility_mode_check
    CHECK (visibility_mode IN ('admin_only', 'all_players', 'selected_players'))
);

CREATE TABLE IF NOT EXISTS public.family_tree_members (
  tree_member_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  tree_id bigint NOT NULL REFERENCES public.family_trees(tree_id) ON UPDATE CASCADE ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES public.npcs(n_id) ON UPDATE CASCADE ON DELETE CASCADE,
  role_label character varying(120),
  branch_label character varying(120),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tree_id, person_id)
);

CREATE OR REPLACE FUNCTION public.worldreborn_validate_family_tree_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.root_person_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.npcs n
    WHERE n.n_id = NEW.root_person_id
      AND n.camp_id = NEW.project_id
      AND n.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Family tree root person must belong to the same project';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_trees_project_scope ON public.family_trees;
CREATE TRIGGER trg_family_trees_project_scope
BEFORE INSERT OR UPDATE OF project_id, root_person_id ON public.family_trees
FOR EACH ROW EXECUTE FUNCTION public.worldreborn_validate_family_tree_scope();

CREATE OR REPLACE FUNCTION public.worldreborn_validate_family_tree_member_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.family_trees ft
    WHERE ft.tree_id = NEW.tree_id
      AND ft.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'Family tree member tree/project mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.npcs n
    WHERE n.n_id = NEW.person_id
      AND n.camp_id = NEW.project_id
      AND n.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Family tree member must belong to the same project';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_family_tree_members_project_scope ON public.family_tree_members;
CREATE TRIGGER trg_family_tree_members_project_scope
BEFORE INSERT OR UPDATE OF project_id, tree_id, person_id ON public.family_tree_members
FOR EACH ROW EXECUTE FUNCTION public.worldreborn_validate_family_tree_member_scope();

-- Extended family semantics. Existing relationship rows are not rewritten.
INSERT INTO public.relationship_types (code, label, inverse_label, category, directed) VALUES
  ('adoptive_parent', 'Adoptive parent', 'Adopted child', 'family', true),
  ('step_parent', 'Step-parent', 'Step-child', 'family', true),
  ('guardian', 'Guardian', 'Ward', 'family', true),
  ('twin', 'Twin', 'Twin', 'family', false),
  ('engaged', 'Engaged to', 'Engaged to', 'family', false),
  ('widowed_from', 'Widowed from', 'Widowed from', 'family', false)
ON CONFLICT (code) DO NOTHING;

-- Stable indexes for server-side pagination and family/group resolution.
CREATE INDEX IF NOT EXISTS npcs_project_name_page_idx
  ON public.npcs(camp_id, name, n_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS groups_project_name_page_idx
  ON public.groups(camp_id, name, gr_id)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS relationships_project_page_idx
  ON public.relationships(project_id, relationship_id);
CREATE INDEX IF NOT EXISTS relationships_project_type_page_idx
  ON public.relationships(project_id, relationship_type_id, relationship_id);
CREATE INDEX IF NOT EXISTS group_memberships_group_page_idx
  ON public.group_memberships(project_id, group_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS family_trees_project_page_idx
  ON public.family_trees(project_id, COALESCE(name, ''), tree_id);
CREATE INDEX IF NOT EXISTS family_tree_members_tree_page_idx
  ON public.family_tree_members(project_id, tree_id, sort_order, person_id);

COMMIT;
