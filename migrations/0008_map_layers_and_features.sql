BEGIN;

CREATE TABLE public.project_map_layers (
  layer_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  map_id bigint NOT NULL REFERENCES public.project_maps(map_id) ON UPDATE CASCADE ON DELETE CASCADE,
  name character varying(120) NOT NULL,
  layer_type character varying(20) NOT NULL,
  source_type character varying(30) NOT NULL,
  source_url text,
  opacity double precision NOT NULL DEFAULT 1,
  z_index integer NOT NULL DEFAULT 0,
  visible_by_default boolean NOT NULL DEFAULT true,
  visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',
  style jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_map_layers_type_check CHECK (layer_type IN ('raster','vector')),
  CONSTRAINT project_map_layers_source_check CHECK (source_type IN ('image','tile','geojson','drawn')),
  CONSTRAINT project_map_layers_opacity_check CHECK (opacity >= 0 AND opacity <= 1),
  CONSTRAINT project_map_layers_visibility_check CHECK (visibility_mode IN ('admin_only','all_players','selected_players')),
  CONSTRAINT project_map_layers_source_url_check CHECK (
    (source_type IN ('image','tile','geojson') AND source_url IS NOT NULL)
    OR source_type = 'drawn'
  ),
  UNIQUE (project_id, map_id, name)
);

CREATE INDEX project_map_layers_map_idx
  ON public.project_map_layers(project_id, map_id, z_index, layer_id);

CREATE TABLE public.map_layer_visibility (
  layer_id bigint NOT NULL REFERENCES public.project_map_layers(layer_id) ON UPDATE CASCADE ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (layer_id, player_id)
);

CREATE TABLE public.map_features (
  feature_id bigserial PRIMARY KEY,
  project_id integer NOT NULL REFERENCES public.campaigns(camp_id) ON UPDATE CASCADE ON DELETE CASCADE,
  map_id bigint NOT NULL REFERENCES public.project_maps(map_id) ON UPDATE CASCADE ON DELETE CASCADE,
  layer_id bigint NOT NULL REFERENCES public.project_map_layers(layer_id) ON UPDATE CASCADE ON DELETE CASCADE,
  geometry_type character varying(30) NOT NULL,
  geometry jsonb NOT NULL,
  entity_type character varying(40),
  entity_id bigint,
  label character varying(200) NOT NULL,
  short_description text,
  visibility_mode character varying(30) NOT NULL DEFAULT 'admin_only',
  style jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT map_features_geometry_type_check CHECK (geometry_type IN ('Point','LineString','Polygon','MultiPoint','MultiLineString','MultiPolygon')),
  CONSTRAINT map_features_geometry_check CHECK (jsonb_typeof(geometry) = 'object'),
  CONSTRAINT map_features_visibility_check CHECK (visibility_mode IN ('admin_only','all_players','selected_players'))
);

CREATE INDEX map_features_map_layer_idx
  ON public.map_features(project_id, map_id, layer_id, feature_id);
CREATE INDEX map_features_entity_idx
  ON public.map_features(project_id, entity_type, entity_id)
  WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

CREATE TABLE public.map_feature_visibility (
  feature_id bigint NOT NULL REFERENCES public.map_features(feature_id) ON UPDATE CASCADE ON DELETE CASCADE,
  player_id integer NOT NULL REFERENCES public.users(user_id) ON UPDATE CASCADE ON DELETE CASCADE,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_id, player_id)
);

-- Every existing map gets a vector layer for countries/regions and one for routes.
INSERT INTO public.project_map_layers(project_id,map_id,name,layer_type,source_type,opacity,z_index,visible_by_default,visibility_mode,style)
SELECT project_id,map_id,'Political','vector','drawn',0.35,100,true,'admin_only',
       '{"fill":"#7c6ee6","stroke":"#ffffff","strokeWidth":2}'::jsonb
FROM public.project_maps
ON CONFLICT (project_id,map_id,name) DO NOTHING;

INSERT INTO public.project_map_layers(project_id,map_id,name,layer_type,source_type,opacity,z_index,visible_by_default,visibility_mode,style)
SELECT project_id,map_id,'Routes & Rivers','vector','drawn',1,120,true,'admin_only',
       '{"stroke":"#67a9cf","strokeWidth":3}'::jsonb
FROM public.project_maps
ON CONFLICT (project_id,map_id,name) DO NOTHING;

COMMIT;
