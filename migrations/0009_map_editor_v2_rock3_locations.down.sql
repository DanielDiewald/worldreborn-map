BEGIN;

DROP TABLE IF EXISTS public.person_location_assignments;
DROP INDEX IF EXISTS public.locations_map_feature_idx;
DROP INDEX IF EXISTS public.locations_hierarchy_idx;
DROP INDEX IF EXISTS public.locations_project_slug_unique;
ALTER TABLE public.locations DROP CONSTRAINT IF EXISTS locations_kind_check;
ALTER TABLE public.locations
  DROP COLUMN IF EXISTS capital_loc_id,
  DROP COLUMN IF EXISTS map_feature_id,
  DROP COLUMN IF EXISTS map_id,
  DROP COLUMN IF EXISTS slug,
  DROP COLUMN IF EXISTS location_kind;

DROP INDEX IF EXISTS public.project_map_layers_role_idx;
DROP INDEX IF EXISTS public.project_map_layers_media_idx;
ALTER TABLE public.project_map_layers DROP CONSTRAINT IF EXISTS project_map_layers_source_check_v2;
ALTER TABLE public.project_map_layers DROP CONSTRAINT IF EXISTS project_map_layers_source_check;
ALTER TABLE public.project_map_layers
  DROP COLUMN IF EXISTS locked,
  DROP COLUMN IF EXISTS layer_role,
  DROP COLUMN IF EXISTS media_id;
ALTER TABLE public.project_map_layers
  ADD CONSTRAINT project_map_layers_source_check CHECK (source_type IN ('image','tile','geojson','drawn')),
  ADD CONSTRAINT project_map_layers_source_url_check CHECK (
    (source_type IN ('image','tile','geojson') AND source_url IS NOT NULL)
    OR source_type='drawn'
  );

COMMIT;
