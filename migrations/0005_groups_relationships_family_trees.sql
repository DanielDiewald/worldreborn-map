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
