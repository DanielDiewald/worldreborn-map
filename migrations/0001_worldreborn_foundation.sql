BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- Existing project root. Do not reinterpret or delete legacy columns.
ALTER TABLE public.campaigns
  ADD COLUMN status character varying(30) NOT NULL DEFAULT 'active',
  ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN in_world_date text,
  ADD COLUMN created_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Legacy person/entity extensions. npcs.n_id remains the canonical person key.
ALTER TABLE public.npcs
  ADD COLUMN public_description text,
  ADD COLUMN admin_notes text,
  ADD COLUMN title character varying(120),
  ADD COLUMN species character varying(80),
  ADD COLUMN profession character varying(120),
  ADD COLUMN visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN archived_at timestamp with time zone,
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD CONSTRAINT npcs_visibility_mode_check
    CHECK (visibility_mode IN ('admin_only', 'all_players', 'selected_players'));

ALTER TABLE public.locations
  ADD COLUMN parent_loc_id integer,
  ADD COLUMN location_type character varying(80),
  ADD COLUMN description text,
  ADD COLUMN owner_n_id integer,
  ADD COLUMN population bigint,
  ADD COLUMN visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN archived_at timestamp with time zone,
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD CONSTRAINT locations_parent_loc_id_fkey
    FOREIGN KEY (parent_loc_id) REFERENCES public.locations(loc_id) ON DELETE SET NULL,
  ADD CONSTRAINT locations_owner_n_id_fkey
    FOREIGN KEY (owner_n_id) REFERENCES public.npcs(n_id) ON DELETE SET NULL,
  ADD CONSTRAINT locations_visibility_mode_check
    CHECK (visibility_mode IN ('admin_only', 'all_players', 'selected_players'));

ALTER TABLE public.groups
  ADD COLUMN group_type character varying(80),
  ADD COLUMN visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN archived_at timestamp with time zone,
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD CONSTRAINT groups_visibility_mode_check
    CHECK (visibility_mode IN ('admin_only', 'all_players', 'selected_players'));

-- Events need explicit project context. Existing rows are backfilled from location when possible.
ALTER TABLE public.events
  ADD COLUMN camp_id integer,
  ADD COLUMN display_date text,
  ADD COLUMN sort_value numeric(30, 6),
  ADD COLUMN era text,
  ADD COLUMN fantasy_year integer,
  ADD COLUMN fantasy_month integer,
  ADD COLUMN fantasy_day integer,
  ADD COLUMN category character varying(80),
  ADD COLUMN importance integer NOT NULL DEFAULT 0,
  ADD COLUMN visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN archived_at timestamp with time zone,
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD CONSTRAINT events_camp_id_fkey
    FOREIGN KEY (camp_id) REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  ADD CONSTRAINT events_visibility_mode_check
    CHECK (visibility_mode IN ('admin_only', 'all_players', 'selected_players'));

UPDATE public.events e
SET camp_id = l.camp_id
FROM public.locations l
WHERE e.camp_id IS NULL
  AND e.loc_id = l.loc_id;

-- Existing users become player identities without destroying their current meaning.
ALTER TABLE public.users
  ADD COLUMN camp_id integer,
  ADD COLUMN display_name character varying(120),
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN created_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD CONSTRAINT users_camp_id_fkey
    FOREIGN KEY (camp_id) REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE SET NULL;

UPDATE public.users
SET camp_id = 1,
    display_name = COALESCE(display_name, name)
WHERE camp_id IS NULL
  AND EXISTS (SELECT 1 FROM public.campaigns WHERE camp_id = 1)
  AND (SELECT count(*) FROM public.campaigns) = 1;

UPDATE public.users
SET display_name = name
WHERE display_name IS NULL;

CREATE TABLE public.auth_rate_limits (
  scope_key character varying(160) PRIMARY KEY,
  window_started_at timestamp with time zone NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  blocked_until timestamp with time zone,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_sessions (
  session_id bigserial PRIMARY KEY,
  token_hash character(64) NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone
);

CREATE TABLE public.player_sessions (
  session_id bigserial PRIMARY KEY,
  player_id integer NOT NULL REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  token_hash character(64) NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone
);

CREATE TABLE public.project_maps (
  map_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  name character varying(120) NOT NULL,
  map_type character varying(20) NOT NULL,
  tile_url text,
  image_path text,
  min_zoom integer NOT NULL DEFAULT 0,
  max_zoom integer NOT NULL DEFAULT 6,
  center_lat double precision,
  center_lng double precision,
  bounds jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_maps_type_check CHECK (map_type IN ('tile', 'image')),
  CONSTRAINT project_maps_source_check CHECK (
    (map_type = 'tile' AND tile_url IS NOT NULL)
    OR (map_type = 'image' AND image_path IS NOT NULL)
  )
);

CREATE UNIQUE INDEX project_maps_one_primary_per_project_uidx
  ON public.project_maps(project_id)
  WHERE is_primary;

ALTER TABLE public.campaigns
  ADD COLUMN primary_map_id bigint,
  ADD CONSTRAINT campaigns_primary_map_id_fkey
    FOREIGN KEY (primary_map_id) REFERENCES public.project_maps(map_id) ON DELETE SET NULL;

INSERT INTO public.project_maps (
  project_id, name, map_type, tile_url, min_zoom, max_zoom, center_lat, center_lng, is_primary, config
)
SELECT
  1,
  'Aetheris Legacy Map',
  'tile',
  '/api/legacy-map/{z}/{x}/{y}.jpeg',
  3,
  6,
  0,
  0,
  true,
  '{"legacy_source":"worldreborn-map","no_wrap":true}'::jsonb
WHERE EXISTS (SELECT 1 FROM public.campaigns WHERE camp_id = 1)
  AND NOT EXISTS (
    SELECT 1 FROM public.project_maps WHERE project_id = 1 AND is_primary
  );

UPDATE public.campaigns c
SET primary_map_id = m.map_id
FROM public.project_maps m
WHERE c.camp_id = 1
  AND m.project_id = c.camp_id
  AND m.is_primary
  AND c.primary_map_id IS NULL;

CREATE TABLE public.map_markers (
  marker_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  map_id bigint NOT NULL REFERENCES public.project_maps(map_id) ON UPDATE CASCADE ON DELETE CASCADE,
  marker_type character varying(40) NOT NULL,
  source_key character varying(160),
  entity_type character varying(40),
  entity_id bigint,
  coordinate_mode character varying(20) NOT NULL DEFAULT 'latlng',
  lat double precision,
  lng double precision,
  x double precision,
  y double precision,
  icon text,
  label character varying(200) NOT NULL,
  short_description text,
  visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',
  layer character varying(80) NOT NULL DEFAULT 'default',
  z_index integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT map_markers_coordinate_mode_check CHECK (coordinate_mode IN ('latlng', 'xy')),
  CONSTRAINT map_markers_visibility_mode_check CHECK (visibility_mode IN ('admin_only', 'all_players', 'selected_players'))
);

CREATE UNIQUE INDEX map_markers_source_uidx
  ON public.map_markers(project_id, map_id, source_key)
  WHERE source_key IS NOT NULL;

CREATE TABLE public.media (
  media_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  entity_type character varying(40),
  entity_id bigint,
  original_filename text,
  stored_filename text,
  storage_path text,
  external_url text,
  mime_type character varying(120),
  size_bytes bigint,
  title text,
  alt_text text,
  uploader_user_id integer REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT media_storage_check CHECK (storage_path IS NOT NULL OR external_url IS NOT NULL)
);

CREATE TABLE public.entity_visibility (
  visibility_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  entity_type character varying(40) NOT NULL,
  entity_id bigint NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_id, player_id, entity_type, entity_id)
);

CREATE TABLE public.player_access_codes (
  access_code_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  code_prefix character varying(12) NOT NULL,
  code_hash character(64) NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_used_at timestamp with time zone,
  revoked_at timestamp with time zone
);

CREATE TABLE public.player_entity_variants (
  variant_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  entity_type character varying(40) NOT NULL,
  entity_id bigint,
  mode character varying(30) NOT NULL,
  name_override text,
  description_override text,
  image_override text,
  location_override integer REFERENCES public.locations(loc_id) ON UPDATE CASCADE ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT player_entity_variants_mode_check CHECK (mode IN ('override', 'standalone_decoy')),
  CONSTRAINT player_entity_variants_target_check CHECK (
    (mode = 'override' AND entity_id IS NOT NULL)
    OR (mode = 'standalone_decoy' AND entity_id IS NULL)
  )
);

CREATE UNIQUE INDEX player_entity_variants_override_uidx
  ON public.player_entity_variants(project_id, player_id, entity_type, entity_id)
  WHERE mode = 'override';

CREATE TABLE public.relationship_types (
  relationship_type_id serial PRIMARY KEY,
  code character varying(60) NOT NULL UNIQUE,
  label character varying(120) NOT NULL,
  inverse_label character varying(120),
  category character varying(60) NOT NULL DEFAULT 'social',
  directed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

INSERT INTO public.relationship_types (code, label, inverse_label, category, directed) VALUES
  ('parent', 'Parent', 'Child', 'family', true),
  ('spouse', 'Spouse', 'Spouse', 'family', false),
  ('ex_partner', 'Ex-Partner', 'Ex-Partner', 'family', false),
  ('sibling', 'Sibling', 'Sibling', 'family', false),
  ('friend', 'Friend', 'Friend', 'social', false),
  ('close_friend', 'Close Friend', 'Close Friend', 'social', false),
  ('ally', 'Ally', 'Ally', 'political', false),
  ('rival', 'Rival', 'Rival', 'social', false),
  ('enemy', 'Enemy', 'Enemy', 'social', false),
  ('mentor', 'Mentor', 'Student', 'social', true),
  ('servant', 'Servant', 'Master', 'social', true),
  ('employer', 'Employer', 'Employee', 'social', true),
  ('ruler', 'Ruler', 'Vassal', 'political', true),
  ('member', 'Member', 'Organization', 'group', true),
  ('founder', 'Founder', 'Founded by', 'group', true),
  ('follower', 'Follower', 'Followed by', 'religion', true),
  ('worships', 'Worships', 'Worshipped by', 'religion', true),
  ('hates', 'Hates', 'Hated by', 'social', true),
  ('romantic', 'Romantic Partner', 'Romantic Partner', 'family', false),
  ('custom', 'Custom Relationship', 'Custom Relationship', 'custom', false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE public.relationships (
  relationship_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  entity_a_type character varying(40) NOT NULL,
  entity_a_id bigint NOT NULL,
  entity_b_type character varying(40) NOT NULL,
  entity_b_id bigint NOT NULL,
  relationship_type_id integer NOT NULL REFERENCES public.relationship_types(relationship_type_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  start_display text,
  end_display text,
  status character varying(30) NOT NULL DEFAULT 'active',
  public_description text,
  admin_notes text,
  visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT relationships_no_self_check CHECK (entity_a_type <> entity_b_type OR entity_a_id <> entity_b_id),
  CONSTRAINT relationships_visibility_mode_check CHECK (visibility_mode IN ('admin_only', 'all_players', 'selected_players'))
);

CREATE TABLE public.group_memberships (
  membership_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  group_id integer NOT NULL REFERENCES public.groups(gr_id) ON UPDATE CASCADE ON DELETE CASCADE,
  entity_type character varying(40) NOT NULL,
  entity_id bigint NOT NULL,
  role text,
  start_display text,
  end_display text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_id, group_id, entity_type, entity_id)
);

CREATE TABLE public.tags (
  tag_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  name character varying(80) NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

CREATE TABLE public.entity_tags (
  entity_tag_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  tag_id bigint NOT NULL REFERENCES public.tags(tag_id) ON UPDATE CASCADE ON DELETE CASCADE,
  entity_type character varying(40) NOT NULL,
  entity_id bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_id, tag_id, entity_type, entity_id)
);

CREATE TABLE public.timeline_links (
  timeline_link_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  event_id integer NOT NULL REFERENCES public.events(e_id) ON UPDATE CASCADE ON DELETE CASCADE,
  entity_type character varying(40) NOT NULL,
  entity_id bigint NOT NULL,
  link_role character varying(60),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (project_id, event_id, entity_type, entity_id)
);

CREATE TABLE public.audit_log (
  audit_id bigserial PRIMARY KEY,
  project_id integer REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE SET NULL,
  actor_type character varying(20) NOT NULL,
  actor_user_id integer REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  action character varying(120) NOT NULL,
  entity_type character varying(40),
  entity_id bigint,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT audit_log_actor_type_check CHECK (actor_type IN ('admin', 'player', 'system'))
);

-- Query and authorization indexes. These do not alter legacy IDs or relationships.
CREATE INDEX npcs_camp_id_idx ON public.npcs(camp_id);
CREATE INDEX locations_camp_id_idx ON public.locations(camp_id);
CREATE INDEX locations_parent_loc_id_idx ON public.locations(parent_loc_id);
CREATE INDEX groups_camp_id_idx ON public.groups(camp_id);
CREATE INDEX groups_loc_id_idx ON public.groups(loc_id);
CREATE INDEX charakters_n_id_idx ON public.charakters(n_id);
CREATE INDEX charakters_loc_id_idx ON public.charakters(loc_id);
CREATE INDEX gods_n_id_idx ON public.gods(n_id);
CREATE INDEX chars_n_id_idx ON public.chars(n_id);
CREATE INDEX chars_user_id_idx ON public.chars(user_id);
CREATE INDEX events_camp_id_idx ON public.events(camp_id);
CREATE INDEX events_loc_id_idx ON public.events(loc_id);
CREATE INDEX is_part_of_group_idx ON public.is_part_of(gr_id);
CREATE INDEX is_part_of_character_idx ON public.is_part_of(char_id);
CREATE INDEX parent_child_parent_idx ON public.parent_child_relationships(parent_id);
CREATE INDEX parent_child_child_idx ON public.parent_child_relationships(child_id);
CREATE INDEX romantic_partner1_idx ON public.romantic_relationships(partner1_id);
CREATE INDEX romantic_partner2_idx ON public.romantic_relationships(partner2_id);

CREATE INDEX player_sessions_lookup_idx ON public.player_sessions(project_id, player_id, expires_at);
CREATE INDEX project_maps_project_idx ON public.project_maps(project_id);
CREATE INDEX map_markers_project_map_idx ON public.map_markers(project_id, map_id);
CREATE INDEX map_markers_entity_idx ON public.map_markers(project_id, entity_type, entity_id);
CREATE INDEX map_markers_visibility_idx ON public.map_markers(project_id, visibility_mode, layer);
CREATE INDEX media_entity_idx ON public.media(project_id, entity_type, entity_id);
CREATE INDEX entity_visibility_lookup_idx ON public.entity_visibility(project_id, player_id, entity_type, entity_id);
CREATE INDEX player_access_codes_player_idx ON public.player_access_codes(project_id, player_id, active);
CREATE INDEX player_variants_lookup_idx ON public.player_entity_variants(project_id, player_id, entity_type, entity_id);
CREATE INDEX relationships_a_idx ON public.relationships(project_id, entity_a_type, entity_a_id);
CREATE INDEX relationships_b_idx ON public.relationships(project_id, entity_b_type, entity_b_id);
CREATE INDEX relationships_type_idx ON public.relationships(project_id, relationship_type_id);
CREATE INDEX group_memberships_entity_idx ON public.group_memberships(project_id, entity_type, entity_id);
CREATE INDEX entity_tags_entity_idx ON public.entity_tags(project_id, entity_type, entity_id);
CREATE INDEX timeline_links_event_idx ON public.timeline_links(project_id, event_id);
CREATE INDEX timeline_links_entity_idx ON public.timeline_links(project_id, entity_type, entity_id);
CREATE INDEX audit_log_project_created_idx ON public.audit_log(project_id, created_at DESC);

COMMIT;
