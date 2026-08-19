BEGIN;

-- Raster layers can point directly at managed media instead of requiring a URL.
ALTER TABLE public.project_map_layers
  ADD COLUMN media_id bigint REFERENCES public.media(media_id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN layer_role character varying(80),
  ADD COLUMN locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.project_map_layers DROP CONSTRAINT project_map_layers_source_check;
ALTER TABLE public.project_map_layers DROP CONSTRAINT project_map_layers_source_url_check;
ALTER TABLE public.project_map_layers
  ADD CONSTRAINT project_map_layers_source_check CHECK (source_type IN ('image','tile','geojson','drawn','media')),
  ADD CONSTRAINT project_map_layers_source_check_v2 CHECK (
    (source_type IN ('image','tile','geojson') AND source_url IS NOT NULL)
    OR (source_type='media' AND media_id IS NOT NULL)
    OR source_type='drawn'
  );

CREATE INDEX project_map_layers_media_idx ON public.project_map_layers(project_id, media_id) WHERE media_id IS NOT NULL;
CREATE INDEX project_map_layers_role_idx ON public.project_map_layers(project_id, map_id, layer_role) WHERE layer_role IS NOT NULL;

-- Locations become a reusable spatial hierarchy. Existing location_type remains for free-form lore labels.
ALTER TABLE public.locations
  ADD COLUMN location_kind character varying(40) NOT NULL DEFAULT 'other',
  ADD COLUMN slug character varying(140),
  ADD COLUMN map_id bigint REFERENCES public.project_maps(map_id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN map_feature_id bigint REFERENCES public.map_features(feature_id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN capital_loc_id integer REFERENCES public.locations(loc_id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_kind_check CHECK (location_kind IN (
    'world','continent','country','region','province','city','town','village','district','building','landmark','wilderness','other'
  ));

CREATE UNIQUE INDEX locations_project_slug_unique ON public.locations(camp_id, slug) WHERE slug IS NOT NULL AND archived_at IS NULL;
CREATE INDEX locations_hierarchy_idx ON public.locations(camp_id, parent_loc_id, location_kind, loc_id) WHERE archived_at IS NULL;
CREATE INDEX locations_map_feature_idx ON public.locations(camp_id, map_id, map_feature_id) WHERE map_id IS NOT NULL OR map_feature_id IS NOT NULL;

-- A person can have multiple meaningful places while charakters.loc_id remains the legacy/current location.
CREATE TABLE public.person_location_assignments (
  assignment_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  person_id integer NOT NULL REFERENCES public.npcs(n_id) ON UPDATE CASCADE ON DELETE CASCADE,
  location_id integer NOT NULL REFERENCES public.locations(loc_id) ON UPDATE CASCADE ON DELETE CASCADE,
  role character varying(30) NOT NULL DEFAULT 'current',
  is_primary boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT person_location_role_check CHECK (role IN ('current','home','birthplace','workplace','seat','origin','temporary','other')),
  UNIQUE(project_id, person_id, location_id, role)
);
CREATE INDEX person_location_person_idx ON public.person_location_assignments(project_id, person_id, role, is_primary DESC);
CREATE INDEX person_location_location_idx ON public.person_location_assignments(project_id, location_id, role);
CREATE UNIQUE INDEX person_location_primary_role_unique ON public.person_location_assignments(project_id, person_id, role) WHERE is_primary;

-- Backfill each NPC's existing charakters.loc_id as the primary current location.
INSERT INTO public.person_location_assignments(project_id, person_id, location_id, role, is_primary)
SELECT n.camp_id, n.n_id, c.loc_id, 'current', true
FROM public.npcs n
JOIN public.charakters c ON c.n_id=n.n_id
JOIN public.locations l ON l.loc_id=c.loc_id AND l.camp_id=n.camp_id
ON CONFLICT DO NOTHING;

-- Give existing political/features layers a semantic role for the v2 editor.
UPDATE public.project_map_layers SET layer_role='political' WHERE layer_role IS NULL AND name='Political';
UPDATE public.project_map_layers SET layer_role='routes' WHERE layer_role IS NULL AND name='Routes & Rivers';

COMMIT;
