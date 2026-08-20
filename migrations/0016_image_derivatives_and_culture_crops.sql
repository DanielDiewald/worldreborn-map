BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '5min';

-- The non-destructive crop model started with person/race. Cultures use the same
-- profile-image workflow now; the original image remains the canonical source.
ALTER TABLE public.entity_image_crops
  DROP CONSTRAINT IF EXISTS entity_image_crops_type_check;
ALTER TABLE public.entity_image_crops
  ADD CONSTRAINT entity_image_crops_type_check
  CHECK (entity_type IN ('person','race','culture'));

-- Small immutable-ish derivatives keep list pages from decoding multi-megabyte originals.
-- A row is replaced whenever source image or crop changes. The source media remains canonical.
CREATE TABLE public.entity_image_derivatives (
  derivative_id bigserial PRIMARY KEY,
  project_id bigint NOT NULL REFERENCES public.campaigns(camp_id) ON DELETE CASCADE,
  entity_type varchar(40) NOT NULL,
  entity_id bigint NOT NULL,
  variant varchar(30) NOT NULL DEFAULT 'avatar',
  source_image text NOT NULL,
  source_media_id bigint REFERENCES public.media(media_id) ON DELETE CASCADE,
  crop jsonb,
  storage_path text NOT NULL,
  mime_type varchar(120) NOT NULL DEFAULT 'image/webp',
  size_bytes bigint NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_image_derivatives_type_check CHECK (entity_type IN ('person','race','culture','group','location')),
  CONSTRAINT entity_image_derivatives_variant_check CHECK (variant IN ('avatar')),
  CONSTRAINT entity_image_derivatives_dimensions_check CHECK (width > 0 AND height > 0 AND size_bytes >= 0),
  CONSTRAINT entity_image_derivatives_crop_check CHECK (
    crop IS NULL OR (
      jsonb_typeof(crop) = 'object'
      AND (crop ? 'x') AND (crop ? 'y') AND (crop ? 'zoom')
      AND (crop->>'x')::numeric BETWEEN 0 AND 100
      AND (crop->>'y')::numeric BETWEEN 0 AND 100
      AND (crop->>'zoom')::numeric BETWEEN 1 AND 4
    )
  ),
  UNIQUE(project_id, entity_type, entity_id, variant)
);

CREATE INDEX entity_image_derivatives_source_media_idx
  ON public.entity_image_derivatives(source_media_id)
  WHERE source_media_id IS NOT NULL;
CREATE INDEX entity_image_derivatives_project_entity_idx
  ON public.entity_image_derivatives(project_id, entity_type, entity_id);

-- List/count helpers used by the denser admin registries.
CREATE INDEX IF NOT EXISTS charakters_race_person_idx ON public.charakters(race_id,n_id);
CREATE INDEX IF NOT EXISTS races_project_parent_active_idx ON public.races(project_id,parent_race_id,race_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS cultures_project_active_name_idx ON public.cultures(project_id,name,culture_id) WHERE archived_at IS NULL;

COMMIT;
