BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Record which objects already existed so the down migration never destroys
-- structures that predate 0005 (important for upgraded/partially pre-provisioned DBs).
CREATE TABLE IF NOT EXISTS public.worldreborn_0005_object_state (
  object_key text PRIMARY KEY,
  existed_before boolean NOT NULL
);

INSERT INTO public.worldreborn_0005_object_state(object_key,existed_before) VALUES
  ('groups_public_description', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='groups' AND column_name='public_description')),
  ('groups_parent_group_id', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='groups' AND column_name='parent_group_id')),
  ('groups_founded_display', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='groups' AND column_name='founded_display')),
  ('groups_dissolved_display', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='groups' AND column_name='dissolved_display')),
  ('gm_rank_label', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='group_memberships' AND column_name='rank_label')),
  ('gm_membership_status', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='group_memberships' AND column_name='membership_status')),
  ('gm_is_leader', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='group_memberships' AND column_name='is_leader')),
  ('gm_notes', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='group_memberships' AND column_name='notes')),
  ('gm_updated_at', EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='group_memberships' AND column_name='updated_at')),
  ('family_trees_table', to_regclass('public.family_trees') IS NOT NULL),
  ('family_tree_members_table', to_regclass('public.family_tree_members') IS NOT NULL),
  ('constraint_groups_parent_not_self', EXISTS(SELECT 1 FROM pg_constraint WHERE conname='groups_parent_not_self_check' AND conrelid='public.groups'::regclass)),
  ('constraint_groups_parent_fk', EXISTS(SELECT 1 FROM pg_constraint WHERE conname='groups_parent_group_id_fkey' AND conrelid='public.groups'::regclass)),
  ('constraint_gm_status', EXISTS(SELECT 1 FROM pg_constraint WHERE conname='group_memberships_status_check' AND conrelid='public.group_memberships'::regclass)),
  ('fn_group_parent_project', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='check_group_parent_project')),
  ('fn_sync_is_part_of', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='sync_is_part_of_to_group_memberships')),
  ('fn_upsert_membership', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='upsert_person_group_membership')),
  ('fn_delete_membership', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='delete_person_group_membership')),
  ('fn_family_root_project', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='check_family_tree_root_project')),
  ('fn_family_member_project', EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='check_family_tree_member_project')),
  ('trigger_group_parent_project', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='groups_parent_project_guard' AND tgrelid='public.groups'::regclass AND NOT tgisinternal)),
  ('trigger_is_part_of_sync', EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='is_part_of_sync_group_memberships' AND tgrelid='public.is_part_of'::regclass AND NOT tgisinternal)),
  ('index_npcs_page', to_regclass('public.npcs_project_name_page_idx') IS NOT NULL),
  ('index_groups_page', to_regclass('public.groups_project_name_page_idx') IS NOT NULL),
  ('index_relationships_page', to_regclass('public.relationships_project_page_idx') IS NOT NULL),
  ('index_relationships_type_page', to_regclass('public.relationships_project_type_page_idx') IS NOT NULL),
  ('index_group_memberships_page', to_regclass('public.group_memberships_group_page_idx') IS NOT NULL),
  ('index_family_trees_page', to_regclass('public.family_trees_project_page_idx') IS NOT NULL),
  ('index_family_tree_members_page', to_regclass('public.family_tree_members_tree_page_idx') IS NOT NULL),
  ('index_family_tree_members_person', to_regclass('public.family_tree_members_person_idx') IS NOT NULL),
  ('relationship_type_adoptive_parent', EXISTS(SELECT 1 FROM public.relationship_types WHERE code='adoptive_parent')),
  ('relationship_type_step_parent', EXISTS(SELECT 1 FROM public.relationship_types WHERE code='step_parent')),
  ('relationship_type_guardian', EXISTS(SELECT 1 FROM public.relationship_types WHERE code='guardian')),
  ('relationship_type_twin', EXISTS(SELECT 1 FROM public.relationship_types WHERE code='twin')),
  ('relationship_type_engaged', EXISTS(SELECT 1 FROM public.relationship_types WHERE code='engaged')),
  ('relationship_type_widowed_from', EXISTS(SELECT 1 FROM public.relationship_types WHERE code='widowed_from'))
ON CONFLICT(object_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- GROUPS: additive metadata only. groups.members remains estimated size.
-- ---------------------------------------------------------------------------
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS public_description text,
  ADD COLUMN IF NOT EXISTS parent_group_id integer,
  ADD COLUMN IF NOT EXISTS founded_display text,
  ADD COLUMN IF NOT EXISTS dissolved_display text;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='groups_parent_not_self_check' AND conrelid='public.groups'::regclass) THEN
    ALTER TABLE public.groups ADD CONSTRAINT groups_parent_not_self_check CHECK (parent_group_id IS NULL OR parent_group_id <> gr_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='groups_parent_group_id_fkey' AND conrelid='public.groups'::regclass) THEN
    ALTER TABLE public.groups ADD CONSTRAINT groups_parent_group_id_fkey FOREIGN KEY (parent_group_id) REFERENCES public.groups(gr_id) ON DELETE SET NULL;
  END IF;
END
$guard$;

DO $create$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='check_group_parent_project') THEN
    EXECUTE $ddl$
      CREATE FUNCTION public.check_group_parent_project()
      RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE parent_project integer;
      BEGIN
        IF NEW.parent_group_id IS NULL THEN RETURN NEW; END IF;
        SELECT camp_id INTO parent_project FROM public.groups WHERE gr_id=NEW.parent_group_id;
        IF parent_project IS NULL THEN RAISE EXCEPTION 'Parent group % does not exist',NEW.parent_group_id; END IF;
        IF parent_project<>NEW.camp_id THEN RAISE EXCEPTION 'Parent group must belong to the same project'; END IF;
        RETURN NEW;
      END
      $body$
    $ddl$;
  END IF;
END
$create$;

DO $trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='groups_parent_project_guard' AND tgrelid='public.groups'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER groups_parent_project_guard BEFORE INSERT OR UPDATE OF parent_group_id,camp_id ON public.groups FOR EACH ROW EXECUTE FUNCTION public.check_group_parent_project();
  END IF;
END
$trigger$;

-- ---------------------------------------------------------------------------
-- MEMBERSHIPS: use the field names present in the supplied legacy database.
-- ---------------------------------------------------------------------------
ALTER TABLE public.group_memberships
  ADD COLUMN IF NOT EXISTS rank_label text,
  ADD COLUMN IF NOT EXISTS membership_status character varying(30) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_leader boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='group_memberships_status_check' AND conrelid='public.group_memberships'::regclass) THEN
    ALTER TABLE public.group_memberships ADD CONSTRAINT group_memberships_status_check CHECK (membership_status IN ('active','former','pending','honorary','unknown'));
  END IF;
END
$guard$;

-- Legacy writes stay supported. char_id is translated to canonical npcs.n_id.
DO $create$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='sync_is_part_of_to_group_memberships') THEN
    EXECUTE $ddl$
      CREATE FUNCTION public.sync_is_part_of_to_group_memberships()
      RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE old_person_id integer; old_project_id integer; new_person_id integer; new_project_id integer;
      BEGIN
        IF TG_OP IN ('DELETE','UPDATE') THEN
          SELECT c.n_id,n.camp_id INTO old_person_id,old_project_id FROM public.charakters c JOIN public.npcs n ON n.n_id=c.n_id WHERE c.char_id=OLD.char_id;
          IF old_person_id IS NOT NULL AND (TG_OP='DELETE' OR OLD.char_id IS DISTINCT FROM NEW.char_id OR OLD.gr_id IS DISTINCT FROM NEW.gr_id) THEN
            DELETE FROM public.group_memberships gm WHERE gm.project_id=old_project_id AND gm.group_id=OLD.gr_id AND gm.entity_type='person' AND gm.entity_id=old_person_id AND (gm.metadata->>'legacy_source'='is_part_of' OR gm.metadata->>'legacy_shadow'='true');
          END IF;
          IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        END IF;

        SELECT c.n_id,n.camp_id INTO new_person_id,new_project_id FROM public.charakters c JOIN public.npcs n ON n.n_id=c.n_id WHERE c.char_id=NEW.char_id;
        IF new_person_id IS NULL THEN RAISE EXCEPTION 'is_part_of.char_id % does not resolve to a Character person',NEW.char_id; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.gr_id=NEW.gr_id AND g.camp_id=new_project_id) THEN RAISE EXCEPTION 'Group % does not belong to Character project %',NEW.gr_id,new_project_id; END IF;

        INSERT INTO public.group_memberships(project_id,group_id,entity_type,entity_id,membership_status,metadata,updated_at)
        VALUES(new_project_id,NEW.gr_id,'person',new_person_id,'active',jsonb_build_object('legacy_source','is_part_of','legacy_char_id',NEW.char_id,'legacy_group_id',NEW.gr_id),now())
        ON CONFLICT(project_id,group_id,entity_type,entity_id)
        DO UPDATE SET metadata=public.group_memberships.metadata||EXCLUDED.metadata,updated_at=now();
        RETURN NEW;
      END
      $body$
    $ddl$;
  END IF;
END
$create$;

DO $trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='is_part_of_sync_group_memberships' AND tgrelid='public.is_part_of'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER is_part_of_sync_group_memberships AFTER INSERT OR DELETE OR UPDATE ON public.is_part_of FOR EACH ROW EXECUTE FUNCTION public.sync_is_part_of_to_group_memberships();
  END IF;
END
$trigger$;

-- Modern CRUD goes through these functions. Characters get an is_part_of shadow; Gods do not.
DO $create$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='upsert_person_group_membership') THEN
    EXECUTE $ddl$
      CREATE FUNCTION public.upsert_person_group_membership(
        p_project_id integer,p_group_id integer,p_person_id integer,p_role text DEFAULT NULL,p_rank_label text DEFAULT NULL,
        p_membership_status character varying DEFAULT 'active',p_is_leader boolean DEFAULT false,p_start_display text DEFAULT NULL,
        p_end_display text DEFAULT NULL,p_notes text DEFAULT NULL
      ) RETURNS bigint LANGUAGE plpgsql AS $body$
      DECLARE result_membership_id bigint; legacy_char_id integer;
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM public.npcs n WHERE n.n_id=p_person_id AND n.camp_id=p_project_id AND n.archived_at IS NULL) THEN RAISE EXCEPTION 'Person % does not belong to project %',p_person_id,p_project_id; END IF;
        IF NOT EXISTS (SELECT 1 FROM public.groups g WHERE g.gr_id=p_group_id AND g.camp_id=p_project_id AND g.archived_at IS NULL) THEN RAISE EXCEPTION 'Group % does not belong to project %',p_group_id,p_project_id; END IF;

        INSERT INTO public.group_memberships(project_id,group_id,entity_type,entity_id,role,rank_label,membership_status,is_leader,start_display,end_display,notes,metadata,updated_at)
        VALUES(p_project_id,p_group_id,'person',p_person_id,p_role,p_rank_label,p_membership_status,p_is_leader,p_start_display,p_end_display,p_notes,'{}'::jsonb,now())
        ON CONFLICT(project_id,group_id,entity_type,entity_id)
        DO UPDATE SET role=EXCLUDED.role,rank_label=EXCLUDED.rank_label,membership_status=EXCLUDED.membership_status,is_leader=EXCLUDED.is_leader,start_display=EXCLUDED.start_display,end_display=EXCLUDED.end_display,notes=EXCLUDED.notes,updated_at=now()
        RETURNING membership_id INTO result_membership_id;

        SELECT c.char_id INTO legacy_char_id FROM public.charakters c WHERE c.n_id=p_person_id;
        IF legacy_char_id IS NOT NULL THEN
          UPDATE public.group_memberships SET metadata=metadata||jsonb_build_object('legacy_shadow',true,'legacy_char_id',legacy_char_id,'legacy_group_id',p_group_id),updated_at=now() WHERE membership_id=result_membership_id;
          INSERT INTO public.is_part_of(gr_id,char_id) VALUES(p_group_id,legacy_char_id) ON CONFLICT(gr_id,char_id) DO NOTHING;
        END IF;
        RETURN result_membership_id;
      END
      $body$
    $ddl$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='delete_person_group_membership') THEN
    EXECUTE $ddl$
      CREATE FUNCTION public.delete_person_group_membership(p_project_id integer,p_group_id integer,p_person_id integer)
      RETURNS boolean LANGUAGE plpgsql AS $body$
      DECLARE legacy_char_id integer; deleted_count integer;
      BEGIN
        SELECT c.char_id INTO legacy_char_id FROM public.charakters c WHERE c.n_id=p_person_id;
        DELETE FROM public.group_memberships WHERE project_id=p_project_id AND group_id=p_group_id AND entity_type='person' AND entity_id=p_person_id;
        GET DIAGNOSTICS deleted_count=ROW_COUNT;
        IF legacy_char_id IS NOT NULL THEN DELETE FROM public.is_part_of WHERE gr_id=p_group_id AND char_id=legacy_char_id; END IF;
        RETURN deleted_count>0;
      END
      $body$
    $ddl$;
  END IF;
END
$create$;

-- ---------------------------------------------------------------------------
-- NAMED FAMILY TREES. Relationships remain the canonical edge source.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_trees (
  family_tree_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  name character varying(160),subtitle character varying(240),description text,
  root_person_id integer REFERENCES public.npcs(n_id) ON UPDATE CASCADE ON DELETE SET NULL,
  visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT family_trees_visibility_check CHECK (visibility_mode IN ('admin_only','all_players','selected_players'))
);

CREATE TABLE IF NOT EXISTS public.family_tree_members (
  family_tree_id bigint NOT NULL REFERENCES public.family_trees(family_tree_id) ON UPDATE CASCADE ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES public.npcs(n_id) ON UPDATE CASCADE ON DELETE CASCADE,
  role_label character varying(120),branch_label character varying(160),sort_order integer NOT NULL DEFAULT 0,notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY(family_tree_id,person_id)
);

DO $create$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='check_family_tree_root_project') THEN
    EXECUTE $ddl$
      CREATE FUNCTION public.check_family_tree_root_project()
      RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE person_project integer;
      BEGIN
        IF NEW.root_person_id IS NULL THEN RETURN NEW; END IF;
        SELECT camp_id INTO person_project FROM public.npcs WHERE n_id=NEW.root_person_id;
        IF person_project IS NULL OR person_project<>NEW.project_id THEN RAISE EXCEPTION 'Family tree root must belong to the same project'; END IF;
        RETURN NEW;
      END
      $body$
    $ddl$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='check_family_tree_member_project') THEN
    EXECUTE $ddl$
      CREATE FUNCTION public.check_family_tree_member_project()
      RETURNS trigger LANGUAGE plpgsql AS $body$
      DECLARE tree_project integer; person_project integer;
      BEGIN
        SELECT project_id INTO tree_project FROM public.family_trees WHERE family_tree_id=NEW.family_tree_id;
        SELECT camp_id INTO person_project FROM public.npcs WHERE n_id=NEW.person_id;
        IF tree_project IS NULL OR person_project IS NULL OR tree_project<>person_project THEN RAISE EXCEPTION 'Family tree member and tree must belong to the same project'; END IF;
        RETURN NEW;
      END
      $body$
    $ddl$;
  END IF;
END
$create$;

DO $trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='family_tree_root_project_guard' AND tgrelid='public.family_trees'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER family_tree_root_project_guard BEFORE INSERT OR UPDATE OF root_person_id,project_id ON public.family_trees FOR EACH ROW EXECUTE FUNCTION public.check_family_tree_root_project();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='family_tree_member_project_guard' AND tgrelid='public.family_tree_members'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER family_tree_member_project_guard BEFORE INSERT OR UPDATE OF family_tree_id,person_id ON public.family_tree_members FOR EACH ROW EXECUTE FUNCTION public.check_family_tree_member_project();
  END IF;
END
$trigger$;

-- Extra family semantics used by the new tree workspace.
INSERT INTO public.relationship_types(code,label,inverse_label,category,directed) VALUES
  ('adoptive_parent','Adoptive parent','Adopted child','family',true),('step_parent','Step-parent','Step-child','family',true),
  ('guardian','Guardian','Ward','family',true),('twin','Twin','Twin','family',false),('engaged','Engaged to','Engaged to','family',false),
  ('widowed_from','Widowed from','Widowed from','family',false)
ON CONFLICT(code) DO NOTHING;

-- Stable server-side pagination indexes.
CREATE INDEX IF NOT EXISTS npcs_project_name_page_idx ON public.npcs(camp_id,archived_at,name,n_id);
CREATE INDEX IF NOT EXISTS groups_project_name_page_idx ON public.groups(camp_id,archived_at,name,gr_id);
CREATE INDEX IF NOT EXISTS relationships_project_page_idx ON public.relationships(project_id,relationship_id);
CREATE INDEX IF NOT EXISTS relationships_project_type_page_idx ON public.relationships(project_id,relationship_type_id,relationship_id);
CREATE INDEX IF NOT EXISTS group_memberships_group_page_idx ON public.group_memberships(project_id,group_id,entity_type,entity_id);
CREATE INDEX IF NOT EXISTS family_trees_project_page_idx ON public.family_trees(project_id,updated_at DESC,family_tree_id DESC);
CREATE INDEX IF NOT EXISTS family_tree_members_tree_page_idx ON public.family_tree_members(family_tree_id,sort_order,person_id);
CREATE INDEX IF NOT EXISTS family_tree_members_person_idx ON public.family_tree_members(person_id,family_tree_id);

COMMIT;
